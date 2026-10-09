// Reads an FBX file with ufbx and writes everything Arcue's scene description needs into one buffer:
// a JSON header followed by typed-array blobs. The layout is decoded by src/decode.ts.

#include <math.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "ufbx.h"

#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#define ARCUE_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define ARCUE_EXPORT
#endif

#define RESULT_MAGIC 0x55435241u
#define RESULT_VERSION 1u
#define SNAP_FRAMES 1e-3
#define MAX_BAKE_SEGMENTS 4096
#define JSON_MAX_DEPTH 64
#define MAX_UV_SETS 8
#define MAX_SKIN_BONES 65534u
#define PARSER_MEMORY_LIMIT ((size_t)1 << 30)

typedef struct {
	uint8_t *data;
	size_t size;
	size_t capacity;
} Buffer;

typedef struct {
	Buffer out;
	uint32_t depth;
	uint32_t counts[JSON_MAX_DEPTH];
	bool after_key;
} Json;

typedef struct {
	uint32_t offset;
	uint32_t count;
} BlobRef;

typedef struct {
	const char *code;
	const char *subject_kind;
	char *subject;
	char *detail;
} Warning;

typedef struct {
	uint32_t *joints;
	float *inverse_bind;
	size_t joint_count;
} Skeleton;

typedef struct {
	uint32_t node;
	ufbx_blend_channel **channels;
	size_t channel_count;
} MeshRecord;

typedef struct {
	ufbx_scene *scene;
	double fps;
	Json json;
	Buffer blobs;

	Warning *warnings;
	size_t warning_count;
	size_t warning_capacity;

	size_t node_count;
	uint32_t *emitted;
	int32_t *node_index;
	bool *has_bind;
	ufbx_matrix *bind_world;
	ufbx_matrix *rest_world;
	ufbx_transform *rest_local;
	bool *is_joint;
	int32_t *mesh_index;

	MeshRecord *meshes;
	size_t mesh_count;

	int32_t *material_index;
	uint32_t *material_order;
	size_t material_count;
	int32_t default_material;

	bool *texture_file_used;

	Skeleton *skeletons;
	size_t skeleton_count;

	double clip_begin;
} Context;

static size_t size_mul(size_t a, size_t b) {
	if (b != 0 && a > SIZE_MAX / b) abort();
	return a * b;
}

static size_t size_add(size_t a, size_t b) {
	if (a > SIZE_MAX - b) abort();
	return a + b;
}

static void *alloc_array(size_t count, size_t element_size) {
	size_t bytes = size_mul(count, element_size);
	void *pointer = malloc(bytes > 0 ? bytes : 1);
	if (!pointer) abort();
	return pointer;
}

static void *alloc_zeroed(size_t count, size_t element_size) {
	size_t bytes = size_mul(count, element_size);
	void *pointer = calloc(bytes > 0 ? bytes : 1, 1);
	if (!pointer) abort();
	return pointer;
}

static void *realloc_array(void *pointer, size_t count, size_t element_size) {
	size_t bytes = size_mul(count, element_size);
	void *grown = realloc(pointer, bytes > 0 ? bytes : 1);
	if (!grown) abort();
	return grown;
}

static uint32_t *alloc_indices(size_t count, uint32_t value) {
	uint32_t *array = (uint32_t *)alloc_array(count, sizeof(uint32_t));
	for (size_t i = 0; i < count; i++) array[i] = value;
	return array;
}

static char *copy_string(const char *data, size_t length) {
	char *copy = (char *)alloc_array(size_add(length, 1), 1);
	memcpy(copy, data, length);
	copy[length] = '\0';
	return copy;
}

static void buffer_reserve(Buffer *buffer, size_t extra) {
	size_t needed = size_add(buffer->size, extra);
	if (needed <= buffer->capacity) return;
	size_t capacity = buffer->capacity > 0 ? buffer->capacity : 4096;
	while (capacity < needed) capacity = capacity > SIZE_MAX / 2 ? needed : capacity * 2;
	buffer->data = (uint8_t *)realloc_array(buffer->data, capacity, 1);
	buffer->capacity = capacity;
}

static void buffer_write(Buffer *buffer, const void *bytes, size_t count) {
	if (count == 0) return;
	buffer_reserve(buffer, count);
	memcpy(buffer->data + buffer->size, bytes, count);
	buffer->size += count;
}

static void buffer_align(Buffer *buffer, size_t alignment) {
	size_t padding = (alignment - buffer->size % alignment) % alignment;
	buffer_reserve(buffer, padding);
	memset(buffer->data + buffer->size, 0, padding);
	buffer->size += padding;
}

static void json_raw(Json *json, const char *text) { buffer_write(&json->out, text, strlen(text)); }

static void json_separate(Json *json) {
	if (json->after_key) {
		json->after_key = false;
		return;
	}
	if (json->depth > 0 && json->counts[json->depth - 1]++ > 0) json_raw(json, ",");
}

static void json_open(Json *json, const char *bracket) {
	json_separate(json);
	json_raw(json, bracket);
	if (json->depth >= JSON_MAX_DEPTH) abort();
	json->counts[json->depth++] = 0;
}

static void json_close(Json *json, const char *bracket) {
	json->depth--;
	json_raw(json, bracket);
}

static void json_quoted(Json *json, const char *text, size_t length) {
	static const char hex[] = "0123456789abcdef";
	buffer_reserve(&json->out, length + 2);
	json_raw(json, "\"");
	for (size_t i = 0; i < length; i++) {
		unsigned char c = (unsigned char)text[i];
		if (c == '"') {
			json_raw(json, "\\\"");
		} else if (c == '\\') {
			json_raw(json, "\\\\");
		} else if (c < 0x20) {
			char escaped[7] = { '\\', 'u', '0', '0', hex[c >> 4], hex[c & 15], '\0' };
			json_raw(json, escaped);
		} else {
			buffer_write(&json->out, &c, 1);
		}
	}
	json_raw(json, "\"");
}

static void json_key(Json *json, const char *key) {
	json_separate(json);
	json_quoted(json, key, strlen(key));
	json_raw(json, ":");
	json->after_key = true;
}

static void json_text(Json *json, const char *text, size_t length) {
	json_separate(json);
	json_quoted(json, text, length);
}

static void json_string(Json *json, ufbx_string string) { json_text(json, string.data, string.length); }

static void json_cstring(Json *json, const char *text) { json_text(json, text, strlen(text)); }

static void json_number_format(Json *json, double value, const char *format) {
	json_separate(json);
	char text[40];
	if (!isfinite(value)) value = 0.0;
	snprintf(text, sizeof(text), format, value);
	json_raw(json, text);
}

static void json_float(Json *json, double value) { json_number_format(json, (double)(float)value, "%.9g"); }

static void json_double(Json *json, double value) { json_number_format(json, value, "%.17g"); }

static void json_uint(Json *json, uint64_t value) {
	json_separate(json);
	char text[24];
	snprintf(text, sizeof(text), "%llu", (unsigned long long)value);
	json_raw(json, text);
}

static void json_int(Json *json, int64_t value) {
	json_separate(json);
	char text[24];
	snprintf(text, sizeof(text), "%lld", (long long)value);
	json_raw(json, text);
}

static void json_bool(Json *json, bool value) {
	json_separate(json);
	json_raw(json, value ? "true" : "false");
}

static void json_null(Json *json) {
	json_separate(json);
	json_raw(json, "null");
}

static void json_floats(Json *json, const double *values, size_t count) {
	json_open(json, "[");
	for (size_t i = 0; i < count; i++) json_float(json, values[i]);
	json_close(json, "]");
}

static void json_blob(Json *json, BlobRef ref) {
	json_open(json, "[");
	json_uint(json, ref.offset);
	json_uint(json, ref.count);
	json_close(json, "]");
}

static BlobRef blob_write(Context *ctx, const void *data, size_t element_size, size_t count) {
	buffer_align(&ctx->blobs, 8);
	if (ctx->blobs.size > UINT32_MAX || count > UINT32_MAX) abort();
	BlobRef ref = { (uint32_t)ctx->blobs.size, (uint32_t)count };
	buffer_write(&ctx->blobs, data, size_mul(element_size, count));
	return ref;
}

static void add_warning(Context *ctx, const char *code, const char *subject_kind, ufbx_string subject, const char *detail) {
	if (ctx->warning_count == ctx->warning_capacity) {
		ctx->warning_capacity = ctx->warning_capacity > 0 ? ctx->warning_capacity * 2 : 8;
		ctx->warnings = (Warning *)realloc_array(ctx->warnings, ctx->warning_capacity, sizeof(Warning));
	}
	Warning *warning = &ctx->warnings[ctx->warning_count++];
	warning->code = code;
	warning->subject_kind = subject_kind;
	warning->subject = subject.data ? copy_string(subject.data, subject.length) : NULL;
	warning->detail = detail ? copy_string(detail, strlen(detail)) : NULL;
}

static const ufbx_string THE_FILE = { NULL, 0 };

static void matrix_to_floats(const ufbx_matrix *m, double out[16]) {
	for (int c = 0; c < 4; c++) {
		out[c * 4 + 0] = m->cols[c].x;
		out[c * 4 + 1] = m->cols[c].y;
		out[c * 4 + 2] = m->cols[c].z;
		out[c * 4 + 3] = c == 3 ? 1.0 : 0.0;
	}
}

static void write_matrix_floats(const ufbx_matrix *m, float *out) {
	double values[16];
	matrix_to_floats(m, values);
	for (int i = 0; i < 16; i++) out[i] = (float)values[i];
}

static bool matrices_close(const ufbx_matrix *a, const ufbx_matrix *b, double tolerance) {
	for (int c = 0; c < 4; c++) {
		double scale = c == 3 ? 1.0 + fabs(a->cols[3].x) + fabs(a->cols[3].y) + fabs(a->cols[3].z) : 1.0;
		if (fabs(a->cols[c].x - b->cols[c].x) > tolerance * scale) return false;
		if (fabs(a->cols[c].y - b->cols[c].y) > tolerance * scale) return false;
		if (fabs(a->cols[c].z - b->cols[c].z) > tolerance * scale) return false;
	}
	return true;
}

static ufbx_vec3 normalized(ufbx_vec3 v) {
	double length = sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
	if (length <= 0.0 || !isfinite(length)) return v;
	ufbx_vec3 result = v;
	result.x /= length;
	result.y /= length;
	result.z /= length;
	return result;
}

static double snap_time(double seconds, double fps) {
	double frames = seconds * fps;
	double whole = round(frames);
	return fabs(frames - whole) < SNAP_FRAMES ? whole / fps : seconds;
}

static double clamp_unit(double value) { return value > 0.0 ? (value < 1.0 ? value : 1.0) : 0.0; }

static double srgb_to_linear(double value) {
	return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4);
}

static bool node_emitted(const Context *ctx, const ufbx_node *node) {
	return node && ctx->node_index[node->typed_id] >= 0;
}

static bool mesh_has_triangles(const ufbx_node *node) {
	return node->mesh && node->mesh->num_triangles > 0 && node->mesh->vertex_position.exists;
}

static ufbx_skin_deformer *mesh_skin(const ufbx_mesh *mesh) {
	for (size_t i = 0; i < mesh->skin_deformers.count; i++) {
		ufbx_skin_deformer *skin = mesh->skin_deformers.data[i];
		if (skin->clusters.count > 0) return skin;
	}
	return NULL;
}

static void collect_nodes(Context *ctx) {
	ufbx_scene *scene = ctx->scene;
	size_t total = scene->nodes.count;
	ctx->emitted = (uint32_t *)alloc_array(total, sizeof(uint32_t));
	ctx->node_index = (int32_t *)alloc_array(total, sizeof(int32_t));
	for (size_t i = 0; i < total; i++) ctx->node_index[i] = -1;

	ufbx_node **stack = (ufbx_node **)alloc_array(size_add(total, 1), sizeof(ufbx_node *));
	size_t top = 0;
	ufbx_node *root = scene->root_node;
	for (size_t i = root->children.count; i > 0; i--) stack[top++] = root->children.data[i - 1];
	while (top > 0) {
		ufbx_node *node = stack[--top];
		if (ctx->node_index[node->typed_id] >= 0) continue;
		ctx->node_index[node->typed_id] = (int32_t)ctx->node_count;
		ctx->emitted[ctx->node_count++] = node->typed_id;
		for (size_t i = node->children.count; i > 0; i--) {
			if (top >= total) break;
			stack[top++] = node->children.data[i - 1];
		}
	}
	free(stack);

	ctx->mesh_index = (int32_t *)alloc_array(total, sizeof(int32_t));
	for (size_t i = 0; i < total; i++) ctx->mesh_index[i] = -1;
	for (size_t i = 0; i < ctx->node_count; i++) {
		ufbx_node *node = scene->nodes.data[ctx->emitted[i]];
		if (mesh_has_triangles(node)) ctx->mesh_index[node->typed_id] = (int32_t)ctx->mesh_count++;
	}
	ctx->meshes = (MeshRecord *)alloc_zeroed(ctx->mesh_count, sizeof(MeshRecord));
}

static void set_bind(Context *ctx, const ufbx_node *node, const ufbx_matrix *world, bool *conflict) {
	if (!node_emitted(ctx, node)) return;
	uint32_t id = node->typed_id;
	if (!ctx->has_bind[id]) {
		ctx->has_bind[id] = true;
		ctx->bind_world[id] = *world;
	} else if (conflict && !matrices_close(&ctx->bind_world[id], world, 1e-4)) {
		*conflict = true;
	}
}

static void compute_rest_pose(Context *ctx) {
	ufbx_scene *scene = ctx->scene;
	size_t total = scene->nodes.count;
	ctx->has_bind = (bool *)alloc_zeroed(total, sizeof(bool));
	ctx->is_joint = (bool *)alloc_zeroed(total, sizeof(bool));
	ctx->bind_world = (ufbx_matrix *)alloc_zeroed(total, sizeof(ufbx_matrix));
	ctx->rest_world = (ufbx_matrix *)alloc_zeroed(total, sizeof(ufbx_matrix));
	ctx->rest_local = (ufbx_transform *)alloc_zeroed(total, sizeof(ufbx_transform));

	bool conflict = false;
	for (size_t i = 0; i < ctx->node_count; i++) {
		ufbx_node *node = scene->nodes.data[ctx->emitted[i]];
		if (!mesh_has_triangles(node)) continue;
		ufbx_skin_deformer *skin = mesh_skin(node->mesh);
		if (!skin) continue;
		for (size_t c = 0; c < skin->clusters.count; c++) {
			ufbx_skin_cluster *cluster = skin->clusters.data[c];
			if (!node_emitted(ctx, cluster->bone_node)) continue;
			ctx->is_joint[cluster->bone_node->typed_id] = true;
			set_bind(ctx, cluster->bone_node, &cluster->bind_to_world, &conflict);
		}
	}
	for (size_t i = 0; i < ctx->node_count; i++) {
		ufbx_node *node = scene->nodes.data[ctx->emitted[i]];
		if (!mesh_has_triangles(node)) continue;
		ufbx_skin_deformer *skin = mesh_skin(node->mesh);
		if (!skin) continue;
		ufbx_skin_cluster *first = skin->clusters.data[0];
		ufbx_matrix mesh_bind = ufbx_matrix_mul(&first->bind_to_world, &first->mesh_node_to_bone);
		set_bind(ctx, node, &mesh_bind, NULL);
	}
	for (size_t p = 0; p < scene->poses.count; p++) {
		ufbx_pose *pose = scene->poses.data[p];
		if (!pose->is_bind_pose) continue;
		for (size_t b = 0; b < pose->bone_poses.count; b++) {
			ufbx_bone_pose *bone_pose = &pose->bone_poses.data[b];
			if (!bone_pose->bone_node || !bone_pose->bone_node->bone) continue;
			set_bind(ctx, bone_pose->bone_node, &bone_pose->bone_to_world, NULL);
		}
	}
	if (conflict) {
		add_warning(ctx, "bind-pose-mismatch", "file", THE_FILE, NULL);
	}

	ufbx_matrix root_world = scene->root_node->node_to_world;
	for (size_t i = 0; i < ctx->node_count; i++) {
		ufbx_node *node = scene->nodes.data[ctx->emitted[i]];
		bool top_level = !node_emitted(ctx, node->parent);
		ufbx_matrix parent_world = top_level ? ufbx_identity_matrix : ctx->rest_world[node->parent->typed_id];
		ufbx_matrix local;
		if (ctx->has_bind[node->typed_id]) {
			ufbx_matrix parent_inverse = ufbx_matrix_invert(&parent_world);
			local = ufbx_matrix_mul(&parent_inverse, &ctx->bind_world[node->typed_id]);
		} else if (top_level) {
			local = ufbx_matrix_mul(&root_world, &node->node_to_parent);
		} else {
			local = node->node_to_parent;
		}
		ufbx_transform transform = ufbx_matrix_to_transform(&local);
		ufbx_matrix rebuilt = ufbx_transform_to_matrix(&transform);
		ctx->rest_local[node->typed_id] = transform;
		ctx->rest_world[node->typed_id] = ufbx_matrix_mul(&parent_world, &rebuilt);
	}
}

static const char *node_kind(const Context *ctx, const ufbx_node *node) {
	if (ctx->mesh_index[node->typed_id] >= 0) return "mesh";
	if (node->bone || ctx->is_joint[node->typed_id]) return "bone";
	return "empty";
}

static ufbx_quat file_rotation(const ufbx_node *node) {
	ufbx_vec3 zero = { 0.0, 0.0, 0.0 };
	ufbx_vec3 euler = ufbx_find_vec3(&node->props, "Lcl Rotation", zero);
	if (!node->use_rotation_space) return ufbx_euler_to_quat(euler, UFBX_ROTATION_ORDER_XYZ);
	ufbx_quat pre = ufbx_euler_to_quat(ufbx_find_vec3(&node->props, "PreRotation", zero), UFBX_ROTATION_ORDER_XYZ);
	ufbx_quat post = ufbx_euler_to_quat(ufbx_find_vec3(&node->props, "PostRotation", zero), UFBX_ROTATION_ORDER_XYZ);
	ufbx_quat post_inverse = { -post.x, -post.y, -post.z, post.w };
	ufbx_quat rotation = ufbx_euler_to_quat(euler, node->rotation_order);
	return ufbx_quat_normalize(ufbx_quat_mul(ufbx_quat_mul(pre, rotation), post_inverse));
}

static void write_file_transform(Json *json, const ufbx_node *node) {
	ufbx_quat r = file_rotation(node);
	ufbx_vec3 one = { 1.0, 1.0, 1.0 };
	ufbx_vec3 s = ufbx_find_vec3(&node->props, "Lcl Scaling", one);
	double rotation[4] = { r.x, r.y, r.z, r.w };
	double scale[3] = { s.x, s.y, s.z };
	json_key(json, "fileRotation");
	json_floats(json, rotation, 4);
	json_key(json, "fileScale");
	json_floats(json, scale, 3);
}

static void write_nodes(Context *ctx) {
	Json *json = &ctx->json;
	json_key(json, "nodes");
	json_open(json, "[");
	for (size_t i = 0; i < ctx->node_count; i++) {
		ufbx_node *node = ctx->scene->nodes.data[ctx->emitted[i]];
		ufbx_transform t = ctx->rest_local[node->typed_id];
		json_open(json, "{");
		json_key(json, "name");
		json_string(json, node->name);
		json_key(json, "parent");
		json_int(json, node_emitted(ctx, node->parent) ? ctx->node_index[node->parent->typed_id] : -1);
		json_key(json, "kind");
		json_cstring(json, node_kind(ctx, node));
		double translation[3] = { t.translation.x, t.translation.y, t.translation.z };
		double rotation[4] = { t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w };
		double scale[3] = { t.scale.x, t.scale.y, t.scale.z };
		json_key(json, "translation");
		json_floats(json, translation, 3);
		json_key(json, "rotation");
		json_floats(json, rotation, 4);
		json_key(json, "scale");
		json_floats(json, scale, 3);
		write_file_transform(json, node);
		json_key(json, "mesh");
		int32_t mesh = ctx->mesh_index[node->typed_id];
		if (mesh >= 0) {
			json_uint(json, (uint32_t)mesh);
		} else {
			json_null(json);
		}
		json_close(json, "}");
	}
	json_close(json, "]");
}

static int32_t material_for_slot(Context *ctx, const ufbx_node *node, uint32_t slot) {
	ufbx_material *material = NULL;
	if (slot < node->materials.count) {
		material = node->materials.data[slot];
	} else if (slot < node->mesh->materials.count) {
		material = node->mesh->materials.data[slot];
	}
	if (!material) {
		if (ctx->default_material < 0) {
			ctx->default_material = (int32_t)ctx->material_count;
			ctx->material_order[ctx->material_count++] = UINT32_MAX;
		}
		return ctx->default_material;
	}
	if (ctx->material_index[material->typed_id] < 0) {
		ctx->material_index[material->typed_id] = (int32_t)ctx->material_count;
		ctx->material_order[ctx->material_count++] = material->typed_id;
	}
	return ctx->material_index[material->typed_id];
}

static int64_t texture_file_of(const ufbx_texture *texture) {
	if (!texture) return -1;
	if (texture->has_file) return texture->file_index;
	for (size_t i = 0; i < texture->file_textures.count; i++) {
		ufbx_texture *file = texture->file_textures.data[i];
		if (file->has_file) return file->file_index;
	}
	return -1;
}

static const char *wrap_name(ufbx_wrap_mode mode) { return mode == UFBX_WRAP_CLAMP ? "clamp" : "repeat"; }

static void write_texture_ref(Context *ctx, const ufbx_material_map *map) {
	Json *json = &ctx->json;
	ufbx_texture *texture = map->texture_enabled ? map->texture : NULL;
	int64_t file = texture_file_of(texture);
	if (file < 0 || (size_t)file >= ctx->scene->texture_files.count) {
		json_null(json);
		return;
	}
	ctx->texture_file_used[file] = true;
	json_open(json, "{");
	json_key(json, "file");
	json_uint(json, (uint64_t)file);
	json_key(json, "uvSet");
	json_string(json, texture->uv_set);
	json_key(json, "wrapU");
	json_cstring(json, wrap_name(texture->wrap_u));
	json_key(json, "wrapV");
	json_cstring(json, wrap_name(texture->wrap_v));
	json_key(json, "transform");
	if (texture->has_uv_transform) {
		const ufbx_matrix *m = &texture->uv_to_texture;
		double scale_u = sqrt(m->cols[0].x * m->cols[0].x + m->cols[0].y * m->cols[0].y);
		double scale_v = sqrt(m->cols[1].x * m->cols[1].x + m->cols[1].y * m->cols[1].y);
		if (m->cols[0].x * m->cols[1].y - m->cols[0].y * m->cols[1].x < 0.0) scale_v = -scale_v;
		double offset[2] = { m->cols[3].x, m->cols[3].y };
		double scale[2] = { scale_u, scale_v };
		json_open(json, "{");
		json_key(json, "offset");
		json_floats(json, offset, 2);
		json_key(json, "scale");
		json_floats(json, scale, 2);
		json_key(json, "rotation");
		json_float(json, atan2(m->cols[0].y, m->cols[0].x));
		json_close(json, "}");
	} else {
		json_null(json);
	}
	json_close(json, "}");
}

static void write_material(Context *ctx, const ufbx_material *material) {
	Json *json = &ctx->json;
	json_open(json, "{");
	json_key(json, "name");
	if (!material) {
		json_text(json, "Default", 7);
		double base[4] = { 0.8, 0.8, 0.8, 1.0 };
		double emissive[3] = { 0.0, 0.0, 0.0 };
		json_key(json, "baseColor");
		json_floats(json, base, 4);
		json_key(json, "metallic");
		json_float(json, 0.0);
		json_key(json, "roughness");
		json_float(json, 0.5);
		json_key(json, "emissive");
		json_floats(json, emissive, 3);
		json_key(json, "alphaMode");
		json_text(json, "opaque", 6);
		json_key(json, "doubleSided");
		json_bool(json, false);
		json_close(json, "}");
		return;
	}
	json_string(json, material->name);

	const ufbx_material_pbr_maps *pbr = &material->pbr;
	double opacity = pbr->opacity.has_value ? pbr->opacity.value_real : 1.0;
	if (!(opacity >= 0.0) || opacity > 1.0) opacity = 1.0;
	double base[4] = { 0.8, 0.8, 0.8, opacity };
	if (pbr->base_color.has_value) {
		base[0] = pbr->base_color.value_vec4.x * pbr->base_factor.value_real;
		base[1] = pbr->base_color.value_vec4.y * pbr->base_factor.value_real;
		base[2] = pbr->base_color.value_vec4.z * pbr->base_factor.value_real;
	}
	double emission = pbr->emission_factor.value_real;
	double emissive[3] = {
		pbr->emission_color.value_vec3.x * emission,
		pbr->emission_color.value_vec3.y * emission,
		pbr->emission_color.value_vec3.z * emission,
	};
	double metallic = pbr->metalness.value_real;
	double roughness = pbr->roughness.has_value ? pbr->roughness.value_real : 0.5;
	bool blended = opacity < 1.0 || texture_file_of(pbr->opacity.texture) >= 0;

	json_key(json, "baseColor");
	json_floats(json, base, 4);
	json_key(json, "baseColorTexture");
	write_texture_ref(ctx, &pbr->base_color);
	json_key(json, "metallic");
	json_float(json, fmin(fmax(metallic, 0.0), 1.0));
	json_key(json, "roughness");
	json_float(json, fmin(fmax(roughness, 0.0), 1.0));
	json_key(json, "roughnessTexture");
	if (material->shader_type == UFBX_SHADER_FBX_PHONG || material->shader_type == UFBX_SHADER_UNKNOWN) {
		json_null(json);
	} else {
		write_texture_ref(ctx, &pbr->roughness);
	}
	json_key(json, "metalnessTexture");
	write_texture_ref(ctx, &pbr->metalness);
	json_key(json, "normalTexture");
	write_texture_ref(ctx, &pbr->normal_map);
	json_key(json, "occlusionTexture");
	write_texture_ref(ctx, &pbr->ambient_occlusion);
	json_key(json, "emissive");
	json_floats(json, emissive, 3);
	json_key(json, "emissiveTexture");
	write_texture_ref(ctx, &pbr->emission_color);
	json_key(json, "alphaMode");
	json_text(json, blended ? "blend" : "opaque", blended ? 5 : 6);
	json_key(json, "doubleSided");
	json_bool(json, material->features.double_sided.enabled);
	json_close(json, "}");
}

static void write_materials(Context *ctx) {
	Json *json = &ctx->json;
	json_key(json, "materials");
	json_open(json, "[");
	for (size_t i = 0; i < ctx->material_count; i++) {
		uint32_t id = ctx->material_order[i];
		write_material(ctx, id == UINT32_MAX ? NULL : ctx->scene->materials.data[id]);
	}
	json_close(json, "]");
}

static void write_texture_files(Context *ctx) {
	Json *json = &ctx->json;
	json_key(json, "textureFiles");
	json_open(json, "[");
	for (size_t i = 0; i < ctx->scene->texture_files.count; i++) {
		ufbx_texture_file *file = &ctx->scene->texture_files.data[i];
		json_open(json, "{");
		json_key(json, "relative");
		json_string(json, file->relative_filename);
		json_key(json, "absolute");
		json_string(json, file->absolute_filename);
		json_key(json, "content");
		if (ctx->texture_file_used[i] && file->content.size > 0) {
			json_blob(json, blob_write(ctx, file->content.data, 1, file->content.size));
		} else {
			json_null(json);
		}
		json_close(json, "}");
	}
	json_close(json, "]");
}

typedef struct {
	uint32_t joint;
	float weight;
} Influence;

typedef struct {
	size_t vertex_count;
	size_t index_count;
	float *positions;
	float *normals;
	float *colors;
	float **uvs;
	size_t uv_count;
	uint32_t *source;
	uint32_t *indices;
	size_t group_count;
	uint32_t *group_start;
	uint32_t *group_triangles;
	int32_t *group_material;
} Geometry;

static void geometry_free(Geometry *geometry) {
	free(geometry->positions);
	free(geometry->normals);
	free(geometry->colors);
	for (size_t s = 0; s < geometry->uv_count; s++) free(geometry->uvs[s]);
	free(geometry->uvs);
	free(geometry->source);
	free(geometry->indices);
	free(geometry->group_start);
	free(geometry->group_triangles);
	free(geometry->group_material);
}

static void store_corner(const ufbx_mesh *mesh, const ufbx_matrix *geometry_to_node, const ufbx_matrix *normal_matrix,
	uint32_t index, Geometry *geometry, size_t corner) {
	uint32_t vertex = mesh->vertex_indices.data[index];
	ufbx_vec3 position = ufbx_transform_position(geometry_to_node, mesh->vertices.data[vertex]);
	ufbx_vec3 normal = ufbx_zero_vec3;
	normal.y = 1.0;
	if (mesh->vertex_normal.exists) {
		normal = normalized(ufbx_transform_direction(normal_matrix, ufbx_get_vertex_vec3(&mesh->vertex_normal, index)));
	}
	geometry->positions[corner * 3 + 0] = (float)position.x;
	geometry->positions[corner * 3 + 1] = (float)position.y;
	geometry->positions[corner * 3 + 2] = (float)position.z;
	geometry->normals[corner * 3 + 0] = (float)normal.x;
	geometry->normals[corner * 3 + 1] = (float)normal.y;
	geometry->normals[corner * 3 + 2] = (float)normal.z;
	for (size_t s = 0; s < geometry->uv_count; s++) {
		const ufbx_vertex_vec2 *attribute = &mesh->uv_sets.data[s].vertex_uv;
		ufbx_vec2 uv = attribute->exists ? ufbx_get_vertex_vec2(attribute, index) : ufbx_zero_vec2;
		geometry->uvs[s][corner * 2 + 0] = (float)uv.x;
		geometry->uvs[s][corner * 2 + 1] = (float)uv.y;
	}
	if (geometry->colors) {
		ufbx_vec4 color = ufbx_get_vertex_vec4(&mesh->color_sets.data[0].vertex_color, index);
		geometry->colors[corner * 4 + 0] = (float)srgb_to_linear(color.x);
		geometry->colors[corner * 4 + 1] = (float)srgb_to_linear(color.y);
		geometry->colors[corner * 4 + 2] = (float)srgb_to_linear(color.z);
		geometry->colors[corner * 4 + 3] = (float)color.w;
	}
	geometry->source[corner] = vertex;
}

static void build_geometry(Context *ctx, const ufbx_node *node, Geometry *geometry) {
	const ufbx_mesh *mesh = node->mesh;
	size_t capacity = size_mul(mesh->num_triangles, 3);
	ufbx_matrix geometry_to_node = node->geometry_to_node;
	ufbx_matrix normal_matrix = ufbx_matrix_for_normals(&geometry_to_node);
	bool flip_winding = ufbx_matrix_determinant(&geometry_to_node) < 0.0;

	memset(geometry, 0, sizeof(*geometry));
	geometry->uv_count = mesh->uv_sets.count < MAX_UV_SETS ? mesh->uv_sets.count : MAX_UV_SETS;
	if (mesh->uv_sets.count > MAX_UV_SETS) {
		add_warning(ctx, "too-many-uv-sets", "node", node->name, NULL);
	}
	geometry->positions = (float *)alloc_array(size_mul(capacity, 3), sizeof(float));
	geometry->normals = (float *)alloc_array(size_mul(capacity, 3), sizeof(float));
	geometry->uvs = (float **)alloc_zeroed(geometry->uv_count, sizeof(float *));
	for (size_t s = 0; s < geometry->uv_count; s++) geometry->uvs[s] = (float *)alloc_array(size_mul(capacity, 2), sizeof(float));
	if (mesh->color_sets.count > 0 && mesh->color_sets.data[0].vertex_color.exists) {
		geometry->colors = (float *)alloc_array(size_mul(capacity, 4), sizeof(float));
	}
	geometry->source = (uint32_t *)alloc_array(capacity, sizeof(uint32_t));
	geometry->group_start = (uint32_t *)alloc_zeroed(mesh->material_parts.count, sizeof(uint32_t));
	geometry->group_triangles = (uint32_t *)alloc_zeroed(mesh->material_parts.count, sizeof(uint32_t));
	geometry->group_material = (int32_t *)alloc_zeroed(mesh->material_parts.count, sizeof(int32_t));
	size_t corner_capacity = size_mul(mesh->max_face_triangles, 3);
	uint32_t *face_corners = (uint32_t *)alloc_array(size_add(corner_capacity, 3), sizeof(uint32_t));

	size_t corner = 0;
	for (size_t p = 0; p < mesh->material_parts.count; p++) {
		const ufbx_mesh_part *part = &mesh->material_parts.data[p];
		size_t first_triangle = corner / 3;
		for (size_t f = 0; f < part->face_indices.count; f++) {
			ufbx_face face = mesh->faces.data[part->face_indices.data[f]];
			uint32_t triangles = ufbx_triangulate_face(face_corners, corner_capacity, mesh, face);
			for (uint32_t t = 0; t < triangles && corner + 3 <= capacity; t++) {
				for (uint32_t k = 0; k < 3; k++) {
					uint32_t which = flip_winding && k > 0 ? 3 - k : k;
					store_corner(mesh, &geometry_to_node, &normal_matrix, face_corners[t * 3 + which], geometry, corner++);
				}
			}
		}
		size_t triangle_count = corner / 3 - first_triangle;
		if (triangle_count == 0) continue;
		geometry->group_start[geometry->group_count] = (uint32_t)first_triangle;
		geometry->group_triangles[geometry->group_count] = (uint32_t)triangle_count;
		geometry->group_material[geometry->group_count] = material_for_slot(ctx, node, part->index);
		geometry->group_count++;
	}
	free(face_corners);

	ufbx_vertex_stream streams[MAX_UV_SETS + 4];
	size_t stream_count = 0;
	streams[stream_count++] = (ufbx_vertex_stream){ geometry->positions, corner, 3 * sizeof(float) };
	streams[stream_count++] = (ufbx_vertex_stream){ geometry->normals, corner, 3 * sizeof(float) };
	streams[stream_count++] = (ufbx_vertex_stream){ geometry->source, corner, sizeof(uint32_t) };
	if (geometry->colors) streams[stream_count++] = (ufbx_vertex_stream){ geometry->colors, corner, 4 * sizeof(float) };
	for (size_t s = 0; s < geometry->uv_count; s++) {
		streams[stream_count++] = (ufbx_vertex_stream){ geometry->uvs[s], corner, 2 * sizeof(float) };
	}
	geometry->indices = (uint32_t *)alloc_array(size_add(corner, 1), sizeof(uint32_t));
	geometry->index_count = corner;
	if (corner > 0) {
		ufbx_error error;
		geometry->vertex_count = ufbx_generate_indices(streams, stream_count, geometry->indices, corner, NULL, &error);
		if (error.type != UFBX_ERROR_NONE) abort();
	}
}

static void write_geometry(Context *ctx, const ufbx_mesh *mesh, const Geometry *geometry) {
	Json *json = &ctx->json;
	size_t count = geometry->vertex_count;
	json_key(json, "positions");
	json_blob(json, blob_write(ctx, geometry->positions, sizeof(float), count * 3));
	json_key(json, "normals");
	json_blob(json, blob_write(ctx, geometry->normals, sizeof(float), count * 3));
	json_key(json, "uvs");
	json_open(json, "[");
	for (size_t s = 0; s < geometry->uv_count; s++) {
		json_open(json, "{");
		json_key(json, "name");
		json_string(json, mesh->uv_sets.data[s].name);
		json_key(json, "values");
		json_blob(json, blob_write(ctx, geometry->uvs[s], sizeof(float), count * 2));
		json_close(json, "}");
	}
	json_close(json, "]");
	json_key(json, "colors");
	if (geometry->colors) {
		json_blob(json, blob_write(ctx, geometry->colors, sizeof(float), count * 4));
	} else {
		json_null(json);
	}
	json_key(json, "indices");
	json_blob(json, blob_write(ctx, geometry->indices, sizeof(uint32_t), geometry->index_count));
	json_key(json, "sourceVertex");
	json_blob(json, blob_write(ctx, geometry->source, sizeof(uint32_t), count));
	json_key(json, "sourceVertexCount");
	json_uint(json, mesh->num_vertices);
	json_key(json, "groups");
	json_open(json, "[");
	for (size_t g = 0; g < geometry->group_count; g++) {
		json_open(json, "{");
		json_key(json, "start");
		json_uint(json, geometry->group_start[g]);
		json_key(json, "triangleCount");
		json_uint(json, geometry->group_triangles[g]);
		json_key(json, "material");
		json_uint(json, (uint32_t)geometry->group_material[g]);
		json_close(json, "}");
	}
	json_close(json, "]");
}

static uint32_t find_or_add_skeleton(Context *ctx, uint32_t *joints, float *inverse_bind, size_t joint_count) {
	for (size_t i = 0; i < ctx->skeleton_count; i++) {
		Skeleton *existing = &ctx->skeletons[i];
		if (existing->joint_count != joint_count) continue;
		if (memcmp(existing->joints, joints, joint_count * sizeof(uint32_t)) != 0) continue;
		if (memcmp(existing->inverse_bind, inverse_bind, joint_count * 16 * sizeof(float)) != 0) continue;
		free(joints);
		free(inverse_bind);
		return (uint32_t)i;
	}
	ctx->skeletons = (Skeleton *)realloc_array(ctx->skeletons, size_add(ctx->skeleton_count, 1), sizeof(Skeleton));
	Skeleton *skeleton = &ctx->skeletons[ctx->skeleton_count];
	skeleton->joints = joints;
	skeleton->inverse_bind = inverse_bind;
	skeleton->joint_count = joint_count;
	return (uint32_t)ctx->skeleton_count++;
}

static void write_no_skin(Json *json) {
	static const char *const keys[] = { "skeleton", "bindMatrix", "joints", "weights", "skinWeights" };
	for (size_t i = 0; i < sizeof(keys) / sizeof(keys[0]); i++) {
		json_key(json, keys[i]);
		json_null(json);
	}
}

typedef struct {
	uint32_t *cluster_joint;
	uint32_t *joints;
	float *inverse_bind;
	size_t joint_count;
} JointMap;

// Gives each distinct bone of the skin a joint, up to MAX_SKIN_BONES so that one more index still fits the 16-bit
// joint indices. Its inverse bind matrix takes scene space at bind time into the bone's space through the cluster's own
// binding, so skinning reproduces ufbx's result for every cluster.
static JointMap map_joints(Context *ctx, const ufbx_node *node, const ufbx_skin_deformer *skin, const ufbx_matrix *unbind) {
	size_t cluster_count = skin->clusters.count;
	size_t capacity = size_add(cluster_count < MAX_SKIN_BONES ? cluster_count : MAX_SKIN_BONES, 1);
	JointMap map;
	map.cluster_joint = alloc_indices(cluster_count, UINT32_MAX);
	map.joints = (uint32_t *)alloc_array(capacity, sizeof(uint32_t));
	map.inverse_bind = (float *)alloc_array(size_mul(capacity, 16), sizeof(float));
	map.joint_count = 0;
	uint32_t *joint_of_node = alloc_indices(ctx->scene->nodes.count, UINT32_MAX);
	bool dropped = false;
	for (size_t c = 0; c < cluster_count; c++) {
		const ufbx_skin_cluster *cluster = skin->clusters.data[c];
		if (!node_emitted(ctx, cluster->bone_node)) continue;
		uint32_t id = cluster->bone_node->typed_id;
		if (joint_of_node[id] == UINT32_MAX) {
			if (map.joint_count == MAX_SKIN_BONES) {
				dropped = true;
				continue;
			}
			joint_of_node[id] = (uint32_t)map.joint_count;
			map.joints[map.joint_count] = (uint32_t)ctx->node_index[id];
			ufbx_matrix inverse = ufbx_matrix_mul(&cluster->mesh_node_to_bone, unbind);
			write_matrix_floats(&inverse, map.inverse_bind + map.joint_count * 16);
			map.joint_count++;
		}
		map.cluster_joint[c] = joint_of_node[id];
	}
	free(joint_of_node);
	if (dropped) {
		add_warning(ctx, "too-many-bones", "node", node->name, NULL);
	}
	return map;
}

static int compare_influences(const void *a, const void *b) {
	const Influence *x = (const Influence *)a;
	const Influence *y = (const Influence *)b;
	if (x->weight != y->weight) return x->weight > y->weight ? -1 : 1;
	return x->joint < y->joint ? -1 : x->joint > y->joint ? 1 : 0;
}

// Sums the influences of one source vertex per joint, strongest first. `slot` maps a joint to its place in `out` and
// holds UINT32_MAX for every joint before and after the call.
static size_t merged_influences(const ufbx_skin_deformer *skin, const JointMap *map, size_t vertex, uint32_t *slot,
	Influence *out) {
	if (vertex >= skin->vertices.count) return 0;
	ufbx_skin_vertex skin_vertex = skin->vertices.data[vertex];
	size_t count = 0;
	for (uint32_t w = 0; w < skin_vertex.num_weights; w++) {
		ufbx_skin_weight weight = skin->weights.data[skin_vertex.weight_begin + w];
		if (weight.cluster_index >= skin->clusters.count) continue;
		uint32_t joint = map->cluster_joint[weight.cluster_index];
		if (joint == UINT32_MAX || !(weight.weight > 0.0)) continue;
		if (slot[joint] == UINT32_MAX) {
			slot[joint] = (uint32_t)count;
			out[count].joint = joint;
			out[count].weight = (float)weight.weight;
			count++;
		} else {
			out[slot[joint]].weight += (float)weight.weight;
		}
	}
	for (size_t i = 0; i < count; i++) slot[out[i].joint] = UINT32_MAX;
	if (count > 1) qsort(out, count, sizeof(Influence), compare_influences);
	return count;
}

typedef struct {
	uint32_t *offsets;
	uint16_t *joints;
	float *weights;
	size_t total;
	uint16_t *strongest_joints;
	float *strongest_weights;
	bool unweighted;
} SourceWeights;

// Collects every influence of each source vertex, and its four strongest normalized. A vertex without influences
// gets the joint after the skin's last one at full weight.
static SourceWeights gather_weights(const ufbx_skin_deformer *skin, const JointMap *map, size_t source_count) {
	size_t bound = 0;
	for (size_t v = 0; v < source_count && v < skin->vertices.count; v++) bound = size_add(bound, skin->vertices.data[v].num_weights);
	if (bound > UINT32_MAX) abort();
	SourceWeights result = { 0 };
	result.offsets = (uint32_t *)alloc_array(size_add(source_count, 1), sizeof(uint32_t));
	result.joints = (uint16_t *)alloc_array(bound, sizeof(uint16_t));
	result.weights = (float *)alloc_array(bound, sizeof(float));
	result.strongest_joints = (uint16_t *)alloc_zeroed(size_mul(source_count, 4), sizeof(uint16_t));
	result.strongest_weights = (float *)alloc_zeroed(size_mul(source_count, 4), sizeof(float));
	Influence *influences = (Influence *)alloc_array(size_add(map->joint_count, 1), sizeof(Influence));
	uint32_t *slot = alloc_indices(size_add(map->joint_count, 1), UINT32_MAX);
	for (size_t v = 0; v < source_count; v++) {
		result.offsets[v] = (uint32_t)result.total;
		size_t count = merged_influences(skin, map, v, slot, influences);
		float sum = 0.0f;
		for (size_t i = 0; i < count; i++) {
			result.joints[result.total + i] = (uint16_t)influences[i].joint;
			result.weights[result.total + i] = influences[i].weight;
			if (i < 4) sum += influences[i].weight;
		}
		result.total += count;
		if (sum > 0.0f) {
			for (size_t i = 0; i < count && i < 4; i++) {
				result.strongest_joints[v * 4 + i] = (uint16_t)influences[i].joint;
				result.strongest_weights[v * 4 + i] = influences[i].weight / sum;
			}
		} else {
			result.unweighted = true;
			result.strongest_joints[v * 4] = (uint16_t)map->joint_count;
			result.strongest_weights[v * 4] = 1.0f;
		}
	}
	result.offsets[source_count] = (uint32_t)result.total;
	free(influences);
	free(slot);
	return result;
}

static void write_rendered_weights(Context *ctx, const SourceWeights *weights, const Geometry *geometry) {
	size_t rendered = geometry->vertex_count;
	uint16_t *joints = (uint16_t *)alloc_array(size_mul(rendered, 4), sizeof(uint16_t));
	float *values = (float *)alloc_array(size_mul(rendered, 4), sizeof(float));
	for (size_t r = 0; r < rendered; r++) {
		memcpy(joints + r * 4, weights->strongest_joints + geometry->source[r] * 4, 4 * sizeof(uint16_t));
		memcpy(values + r * 4, weights->strongest_weights + geometry->source[r] * 4, 4 * sizeof(float));
	}
	json_key(&ctx->json, "joints");
	json_blob(&ctx->json, blob_write(ctx, joints, sizeof(uint16_t), rendered * 4));
	json_key(&ctx->json, "weights");
	json_blob(&ctx->json, blob_write(ctx, values, sizeof(float), rendered * 4));
	free(joints);
	free(values);
}

// Writes the skeleton reference, bind matrix, full source weights and the four strongest weights per rendered vertex.
// Returns the matrix that takes the node's local positions to scene space in the rest pose.
static ufbx_matrix write_skin(Context *ctx, const ufbx_node *node, const Geometry *geometry) {
	Json *json = &ctx->json;
	const ufbx_mesh *mesh = node->mesh;
	ufbx_skin_deformer *skin = mesh_skin(mesh);
	if (!skin) {
		write_no_skin(json);
		return ctx->rest_world[node->typed_id];
	}
	for (size_t i = 0; i < mesh->skin_deformers.count; i++) {
		if (mesh->skin_deformers.data[i] != skin && mesh->skin_deformers.data[i]->clusters.count > 0) {
			add_warning(ctx, "extra-skins", "node", node->name, NULL);
			break;
		}
	}

	ufbx_skin_cluster *first = skin->clusters.data[0];
	ufbx_matrix bind_matrix = ufbx_matrix_mul(&first->bind_to_world, &first->mesh_node_to_bone);
	ufbx_matrix unbind = ufbx_matrix_invert(&bind_matrix);
	JointMap map = map_joints(ctx, node, skin, &unbind);
	SourceWeights weights = gather_weights(skin, &map, mesh->num_vertices);
	if (weights.unweighted) {
		map.joints[map.joint_count] = (uint32_t)ctx->node_index[node->typed_id];
		write_matrix_floats(&unbind, map.inverse_bind + map.joint_count * 16);
		map.joint_count++;
		add_warning(ctx, "unweighted-vertices", "node", node->name, NULL);
	}

	double bind_values[16];
	matrix_to_floats(&bind_matrix, bind_values);
	json_key(json, "skeleton");
	json_uint(json, find_or_add_skeleton(ctx, map.joints, map.inverse_bind, map.joint_count));
	json_key(json, "bindMatrix");
	json_floats(json, bind_values, 16);
	write_rendered_weights(ctx, &weights, geometry);
	json_key(json, "skinWeights");
	json_open(json, "{");
	json_key(json, "offsets");
	json_blob(json, blob_write(ctx, weights.offsets, sizeof(uint32_t), mesh->num_vertices + 1));
	json_key(json, "joints");
	json_blob(json, blob_write(ctx, weights.joints, sizeof(uint16_t), weights.total));
	json_key(json, "weights");
	json_blob(json, blob_write(ctx, weights.weights, sizeof(float), weights.total));
	json_close(json, "}");

	free(weights.offsets);
	free(weights.joints);
	free(weights.weights);
	free(weights.strongest_joints);
	free(weights.strongest_weights);
	free(map.cluster_joint);
	return bind_matrix;
}

static void write_rest_positions(Context *ctx, const ufbx_node *node, const ufbx_matrix *local_to_scene) {
	const ufbx_mesh *mesh = node->mesh;
	ufbx_matrix rest_matrix = ufbx_matrix_mul(local_to_scene, &node->geometry_to_node);
	float *rest = (float *)alloc_array(size_mul(mesh->num_vertices, 3), sizeof(float));
	for (size_t v = 0; v < mesh->num_vertices; v++) {
		ufbx_vec3 position = ufbx_transform_position(&rest_matrix, mesh->vertices.data[v]);
		rest[v * 3 + 0] = (float)position.x;
		rest[v * 3 + 1] = (float)position.y;
		rest[v * 3 + 2] = (float)position.z;
	}
	json_key(&ctx->json, "restPositions");
	json_blob(&ctx->json, blob_write(ctx, rest, sizeof(float), mesh->num_vertices * 3));
	free(rest);
}

static void write_morph_targets(Context *ctx, const ufbx_node *node, const Geometry *geometry, MeshRecord *record) {
	Json *json = &ctx->json;
	const ufbx_mesh *mesh = node->mesh;
	size_t source_count = mesh->num_vertices;
	ufbx_matrix normal_matrix = ufbx_matrix_for_normals(&node->geometry_to_node);

	size_t capacity = 0;
	for (size_t b = 0; b < mesh->blend_deformers.count; b++) capacity = size_add(capacity, mesh->blend_deformers.data[b]->channels.count);
	record->node = (uint32_t)ctx->node_index[node->typed_id];
	record->channels = (ufbx_blend_channel **)alloc_zeroed(capacity, sizeof(ufbx_blend_channel *));
	bool all_normals = true;
	bool in_betweens = false;
	for (size_t b = 0; b < mesh->blend_deformers.count; b++) {
		ufbx_blend_deformer *deformer = mesh->blend_deformers.data[b];
		for (size_t c = 0; c < deformer->channels.count; c++) {
			ufbx_blend_channel *channel = deformer->channels.data[c];
			if (!channel->target_shape) continue;
			if (channel->keyframes.count > 1) in_betweens = true;
			if (channel->target_shape->normal_offsets.count < channel->target_shape->num_offsets) all_normals = false;
			record->channels[record->channel_count++] = channel;
		}
	}
	if (in_betweens) {
		add_warning(ctx, "inbetween-shapes", "node", node->name, NULL);
	}

	float *dense_positions = (float *)alloc_array(size_mul(source_count, 3), sizeof(float));
	float *dense_normals = (float *)alloc_array(size_mul(source_count, 3), sizeof(float));
	float *rendered = (float *)alloc_array(size_mul(geometry->vertex_count, 3), sizeof(float));
	json_key(json, "morphTargets");
	json_open(json, "[");
	for (size_t m = 0; m < record->channel_count; m++) {
		const ufbx_blend_shape *shape = record->channels[m]->target_shape;
		memset(dense_positions, 0, source_count * 3 * sizeof(float));
		memset(dense_normals, 0, source_count * 3 * sizeof(float));
		for (size_t o = 0; o < shape->num_offsets; o++) {
			uint32_t vertex = shape->offset_vertices.data[o];
			if (vertex >= source_count) continue;
			double weight = o < shape->offset_weights.count ? shape->offset_weights.data[o] : 1.0;
			ufbx_vec3 offset = ufbx_transform_direction(&node->geometry_to_node, shape->position_offsets.data[o]);
			dense_positions[vertex * 3 + 0] = (float)(offset.x * weight);
			dense_positions[vertex * 3 + 1] = (float)(offset.y * weight);
			dense_positions[vertex * 3 + 2] = (float)(offset.z * weight);
			if (all_normals) {
				ufbx_vec3 normal = ufbx_transform_direction(&normal_matrix, shape->normal_offsets.data[o]);
				dense_normals[vertex * 3 + 0] = (float)(normal.x * weight);
				dense_normals[vertex * 3 + 1] = (float)(normal.y * weight);
				dense_normals[vertex * 3 + 2] = (float)(normal.z * weight);
			}
		}
		json_open(json, "{");
		json_key(json, "name");
		json_string(json, record->channels[m]->name);
		json_key(json, "defaultWeight");
		json_float(json, clamp_unit(record->channels[m]->weight));
		for (size_t r = 0; r < geometry->vertex_count; r++) {
			memcpy(rendered + r * 3, dense_positions + geometry->source[r] * 3, 3 * sizeof(float));
		}
		json_key(json, "positions");
		json_blob(json, blob_write(ctx, rendered, sizeof(float), geometry->vertex_count * 3));
		json_key(json, "normals");
		if (all_normals) {
			for (size_t r = 0; r < geometry->vertex_count; r++) {
				memcpy(rendered + r * 3, dense_normals + geometry->source[r] * 3, 3 * sizeof(float));
			}
			json_blob(json, blob_write(ctx, rendered, sizeof(float), geometry->vertex_count * 3));
		} else {
			json_null(json);
		}
		json_close(json, "}");
	}
	json_close(json, "]");
	free(dense_positions);
	free(dense_normals);
	free(rendered);
}

static void write_mesh(Context *ctx, const ufbx_node *node, MeshRecord *record) {
	Geometry geometry;
	build_geometry(ctx, node, &geometry);
	json_open(&ctx->json, "{");
	json_key(&ctx->json, "name");
	json_string(&ctx->json, node->name);
	json_key(&ctx->json, "geometryName");
	json_string(&ctx->json, node->mesh->name);
	write_geometry(ctx, node->mesh, &geometry);
	ufbx_matrix local_to_scene = write_skin(ctx, node, &geometry);
	write_rest_positions(ctx, node, &local_to_scene);
	write_morph_targets(ctx, node, &geometry, record);
	json_close(&ctx->json, "}");
	geometry_free(&geometry);
}

static void write_meshes(Context *ctx) {
	Json *json = &ctx->json;
	json_key(json, "meshes");
	json_open(json, "[");
	for (size_t i = 0; i < ctx->node_count; i++) {
		ufbx_node *node = ctx->scene->nodes.data[ctx->emitted[i]];
		int32_t mesh = ctx->mesh_index[node->typed_id];
		if (mesh < 0) continue;
		write_mesh(ctx, node, &ctx->meshes[mesh]);
	}
	json_close(json, "]");
}

static void write_skeletons(Context *ctx) {
	Json *json = &ctx->json;
	json_key(json, "skeletons");
	json_open(json, "[");
	for (size_t i = 0; i < ctx->skeleton_count; i++) {
		Skeleton *skeleton = &ctx->skeletons[i];
		json_open(json, "{");
		json_key(json, "joints");
		json_open(json, "[");
		for (size_t j = 0; j < skeleton->joint_count; j++) json_uint(json, skeleton->joints[j]);
		json_close(json, "]");
		json_key(json, "inverseBindMatrices");
		json_blob(json, blob_write(ctx, skeleton->inverse_bind, sizeof(float), skeleton->joint_count * 16));
		json_close(json, "}");
	}
	json_close(json, "]");
}

typedef struct {
	double *times;
	uint32_t *flags;
	double *values;
	size_t count;
	size_t components;
} Channel;

static bool string_equals(ufbx_string string, const char *text) {
	return string.length == strlen(text) && memcmp(string.data, text, string.length) == 0;
}

static bool is_transform_prop(ufbx_string name) {
	static const char *const names[] = {
		UFBX_Lcl_Translation, UFBX_Lcl_Rotation, UFBX_Lcl_Scaling, UFBX_PreRotation, UFBX_PostRotation,
		UFBX_RotationOffset, UFBX_ScalingOffset, UFBX_RotationPivot, UFBX_ScalingPivot, UFBX_RotationOrder,
	};
	for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++) {
		if (string_equals(name, names[i])) return true;
	}
	return false;
}

static void write_track(Context *ctx, uint32_t node, const char *property, const Channel *channel) {
	if (channel->count == 0) return;
	Json *json = &ctx->json;
	size_t n = channel->count;
	size_t k = channel->components;

	bool constant = true;
	for (size_t i = 1; i < n && constant; i++) {
		for (size_t c = 0; c < k; c++) {
			if (channel->values[i * k + c] != channel->values[c]) {
				constant = false;
				break;
			}
		}
	}

	bool has_left = false;
	bool has_right = false;
	for (size_t i = 0; i < n; i++) {
		if (channel->flags[i] & UFBX_BAKED_KEY_STEP_LEFT) has_left = true;
		if (channel->flags[i] & UFBX_BAKED_KEY_STEP_RIGHT) has_right = true;
	}
	bool stepped = !constant && has_left && !has_right;
	for (size_t i = 0; stepped && i + 1 < n; i++) {
		if (channel->flags[i + 1] & UFBX_BAKED_KEY_STEP_LEFT) continue;
		if (channel->flags[i] & UFBX_BAKED_KEY_STEP_LEFT) continue;
		for (size_t c = 0; c < k; c++) {
			if (channel->values[i * k + c] != channel->values[(i + 1) * k + c]) {
				stepped = false;
				break;
			}
		}
	}

	float *times = (float *)alloc_array(n, sizeof(float));
	float *values = (float *)alloc_array(size_mul(n, k), sizeof(float));
	size_t kept = 0;
	for (size_t i = 0; i < n; i++) {
		if (constant && i > 0) break;
		if (stepped && (channel->flags[i] & UFBX_BAKED_KEY_STEP_LEFT)) continue;
		bool step_edge = (channel->flags[i] & (UFBX_BAKED_KEY_STEP_LEFT | UFBX_BAKED_KEY_STEP_RIGHT)) != 0;
		double time = constant ? 0.0 : channel->times[i] - ctx->clip_begin;
		if (!step_edge) time = snap_time(time, ctx->fps);
		times[kept] = (float)time;
		for (size_t c = 0; c < k; c++) values[kept * k + c] = (float)channel->values[i * k + c];
		kept++;
	}

	json_open(json, "{");
	json_key(json, "node");
	json_uint(json, node);
	json_key(json, "property");
	json_cstring(json, property);
	json_key(json, "interpolation");
	json_text(json, stepped ? "step" : "linear", stepped ? 4 : 6);
	json_key(json, "times");
	json_blob(json, blob_write(ctx, times, sizeof(float), kept));
	json_key(json, "values");
	json_blob(json, blob_write(ctx, values, sizeof(float), kept * k));
	json_close(json, "}");
	free(times);
	free(values);
}

static void channel_alloc(Channel *channel, size_t count, size_t components) {
	channel->times = (double *)alloc_array(count, sizeof(double));
	channel->flags = (uint32_t *)alloc_array(count, sizeof(uint32_t));
	channel->values = (double *)alloc_array(size_mul(count, components), sizeof(double));
	channel->count = count;
	channel->components = components;
}

static void channel_free(Channel *channel) {
	free(channel->times);
	free(channel->flags);
	free(channel->values);
}

static void write_vec3_track(Context *ctx, uint32_t node, const char *property, ufbx_baked_vec3_list keys) {
	Channel channel;
	channel_alloc(&channel, keys.count, 3);
	for (size_t i = 0; i < keys.count; i++) {
		channel.times[i] = keys.data[i].time;
		channel.flags[i] = keys.data[i].flags;
		channel.values[i * 3 + 0] = keys.data[i].value.x;
		channel.values[i * 3 + 1] = keys.data[i].value.y;
		channel.values[i * 3 + 2] = keys.data[i].value.z;
	}
	write_track(ctx, node, property, &channel);
	channel_free(&channel);
}

static void write_quat_track(Context *ctx, uint32_t node, ufbx_baked_quat_list keys) {
	Channel channel;
	channel_alloc(&channel, keys.count, 4);
	ufbx_quat previous = ufbx_identity_quat;
	for (size_t i = 0; i < keys.count; i++) {
		ufbx_quat q = keys.data[i].value;
		if (i > 0 && ufbx_quat_dot(q, previous) < 0.0) {
			q.x = -q.x;
			q.y = -q.y;
			q.z = -q.z;
			q.w = -q.w;
		}
		previous = q;
		channel.times[i] = keys.data[i].time;
		channel.flags[i] = keys.data[i].flags;
		channel.values[i * 4 + 0] = q.x;
		channel.values[i * 4 + 1] = q.y;
		channel.values[i * 4 + 2] = q.z;
		channel.values[i * 4 + 3] = q.w;
	}
	write_track(ctx, node, "rotation", &channel);
	channel_free(&channel);
}

static int compare_doubles(const void *a, const void *b) {
	double x = *(const double *)a;
	double y = *(const double *)b;
	return x < y ? -1 : x > y ? 1 : 0;
}

static const ufbx_baked_prop *find_baked_weight(ufbx_baked_anim *bake, ufbx_blend_channel *channel) {
	ufbx_baked_element *element = ufbx_find_baked_element(bake, &channel->element);
	if (!element) return NULL;
	for (size_t p = 0; p < element->props.count; p++) {
		if (string_equals(element->props.data[p].name, UFBX_DeformPercent)) return &element->props.data[p];
	}
	return NULL;
}


static void write_weights_track(Context *ctx, ufbx_baked_anim *bake, const MeshRecord *record) {
	if (record->channel_count == 0) return;
	const ufbx_baked_prop **baked = (const ufbx_baked_prop **)alloc_zeroed(record->channel_count, sizeof(ufbx_baked_prop *));
	size_t total_keys = 0;
	for (size_t c = 0; c < record->channel_count; c++) {
		baked[c] = find_baked_weight(bake, record->channels[c]);
		if (baked[c]) total_keys = size_add(total_keys, baked[c]->keys.count);
	}
	if (total_keys == 0) {
		free(baked);
		return;
	}
	double *times = (double *)alloc_array(total_keys, sizeof(double));
	size_t time_count = 0;
	for (size_t c = 0; c < record->channel_count; c++) {
		if (!baked[c]) continue;
		for (size_t i = 0; i < baked[c]->keys.count; i++) times[time_count++] = baked[c]->keys.data[i].time;
	}
	qsort(times, time_count, sizeof(double), compare_doubles);
	size_t unique = 0;
	for (size_t i = 0; i < time_count; i++) {
		if (unique == 0 || times[i] != times[unique - 1]) times[unique++] = times[i];
	}

	Channel channel;
	channel_alloc(&channel, unique, record->channel_count);
	for (size_t i = 0; i < unique; i++) {
		channel.times[i] = times[i];
		channel.flags[i] = 0;
		for (size_t c = 0; c < record->channel_count; c++) {
			double weight = baked[c] ? ufbx_evaluate_baked_vec3(baked[c]->keys, times[i]).x * 0.01 : record->channels[c]->weight;
			channel.values[i * record->channel_count + c] = clamp_unit(weight);
		}
	}
	write_track(ctx, record->node, "weights", &channel);
	channel_free(&channel);
	free(times);
	free(baked);
}

typedef struct {
	float *times;
	size_t count;
	uint64_t hash;
} CurveTimes;

static int compare_pointers(const void *a, const void *b) {
	uintptr_t x = (uintptr_t)*(void *const *)a;
	uintptr_t y = (uintptr_t)*(void *const *)b;
	return x < y ? -1 : x > y ? 1 : 0;
}

static size_t collect_curves(Context *ctx, const ufbx_anim_stack *stack, ufbx_anim_curve ***out) {
	size_t capacity = 0;
	for (size_t l = 0; l < stack->layers.count; l++) capacity = size_add(capacity, size_mul(stack->layers.data[l]->anim_props.count, 3));
	ufbx_anim_curve **curves = (ufbx_anim_curve **)alloc_array(capacity, sizeof(ufbx_anim_curve *));
	size_t count = 0;
	for (size_t l = 0; l < stack->layers.count; l++) {
		const ufbx_anim_layer *layer = stack->layers.data[l];
		for (size_t p = 0; p < layer->anim_props.count; p++) {
			const ufbx_anim_prop *prop = &layer->anim_props.data[p];
			const ufbx_element *element = prop->element;
			if (!element || !prop->anim_value) continue;
			if (element->type == UFBX_ELEMENT_NODE) {
				if (!is_transform_prop(prop->prop_name)) continue;
				if (!node_emitted(ctx, (const ufbx_node *)element)) continue;
			} else if (element->type == UFBX_ELEMENT_BLEND_CHANNEL) {
				if (!string_equals(prop->prop_name, UFBX_DeformPercent)) continue;
			} else {
				continue;
			}
			for (int c = 0; c < 3; c++) {
				ufbx_anim_curve *curve = prop->anim_value->curves[c];
				if (curve && curve->keyframes.count > 0) curves[count++] = curve;
			}
		}
	}
	qsort(curves, count, sizeof(ufbx_anim_curve *), compare_pointers);
	size_t unique = 0;
	for (size_t i = 0; i < count; i++) {
		if (unique == 0 || curves[i] != curves[unique - 1]) curves[unique++] = curves[i];
	}
	*out = curves;
	return unique;
}

static double clip_duration(const ufbx_anim_stack *stack, ufbx_anim_curve *const *curves, size_t curve_count,
	double fps, double *begin) {
	*begin = stack->anim->time_begin;
	double end = stack->anim->time_end;
	if (!(end > *begin) && curve_count > 0) {
		*begin = INFINITY;
		end = -INFINITY;
		for (size_t c = 0; c < curve_count; c++) {
			ufbx_keyframe_list keys = curves[c]->keyframes;
			*begin = fmin(*begin, keys.data[0].time);
			end = fmax(end, keys.data[keys.count - 1].time);
		}
	}
	return end > *begin ? snap_time(end - *begin, fps) : 0.0;
}

// Writes each curve's key times once: curves keyed at identical times share one list.
static void write_curve_times(Context *ctx, ufbx_anim_curve *const *curves, size_t curve_count, double begin) {
	CurveTimes *unique = (CurveTimes *)alloc_zeroed(curve_count, sizeof(CurveTimes));
	size_t table_size = 16;
	while (table_size / 2 < curve_count && table_size < SIZE_MAX / 4) table_size *= 2;
	uint32_t *table = alloc_indices(table_size, UINT32_MAX);
	size_t unique_count = 0;
	size_t total = 0;
	for (size_t c = 0; c < curve_count; c++) {
		ufbx_keyframe_list keys = curves[c]->keyframes;
		float *times = (float *)alloc_array(keys.count, sizeof(float));
		uint64_t hash = 1469598103934665603ull;
		for (size_t k = 0; k < keys.count; k++) {
			times[k] = (float)snap_time(keys.data[k].time - begin, ctx->fps);
			uint32_t bits;
			memcpy(&bits, &times[k], sizeof(bits));
			hash = (hash ^ bits) * 1099511628211ull;
		}
		size_t at = (size_t)hash & (table_size - 1);
		bool duplicate = false;
		while (table[at] != UINT32_MAX && !duplicate) {
			const CurveTimes *other = &unique[table[at]];
			duplicate = other->hash == hash && other->count == keys.count &&
				memcmp(other->times, times, keys.count * sizeof(float)) == 0;
			if (!duplicate) at = (at + 1) & (table_size - 1);
		}
		if (duplicate) {
			free(times);
			continue;
		}
		table[at] = (uint32_t)unique_count;
		unique[unique_count++] = (CurveTimes){ times, keys.count, hash };
		total = size_add(total, keys.count);
	}
	free(table);

	float *all_times = (float *)alloc_array(total, sizeof(float));
	uint32_t *offsets = (uint32_t *)alloc_array(size_add(unique_count, 1), sizeof(uint32_t));
	size_t cursor = 0;
	for (size_t u = 0; u < unique_count; u++) {
		offsets[u] = (uint32_t)cursor;
		memcpy(all_times + cursor, unique[u].times, unique[u].count * sizeof(float));
		cursor += unique[u].count;
		free(unique[u].times);
	}
	offsets[unique_count] = (uint32_t)cursor;
	json_key(&ctx->json, "curveTimes");
	json_blob(&ctx->json, blob_write(ctx, all_times, sizeof(float), total));
	json_key(&ctx->json, "curveOffsets");
	json_blob(&ctx->json, blob_write(ctx, offsets, sizeof(uint32_t), unique_count + 1));
	free(all_times);
	free(offsets);
	free(unique);
}

static void write_tracks(Context *ctx, const ufbx_anim_stack *stack) {
	ufbx_bake_opts opts = { 0 };
	opts.temp_allocator.memory_limit = PARSER_MEMORY_LIMIT;
	opts.result_allocator.memory_limit = PARSER_MEMORY_LIMIT;
	opts.resample_rate = ctx->fps;
	opts.max_keyframe_segments = MAX_BAKE_SEGMENTS;
	opts.step_handling = UFBX_BAKE_STEP_HANDLING_DEFAULT;
	ufbx_error error;
	ufbx_baked_anim *bake = ufbx_bake_anim(ctx->scene, stack->anim, &opts, &error);
	json_key(&ctx->json, "tracks");
	json_open(&ctx->json, "[");
	if (bake) {
		for (size_t i = 0; i < bake->nodes.count; i++) {
			const ufbx_baked_node *baked = &bake->nodes.data[i];
			if (baked->typed_id >= ctx->scene->nodes.count) continue;
			int32_t node = ctx->node_index[baked->typed_id];
			if (node < 0) continue;
			write_vec3_track(ctx, (uint32_t)node, "translation", baked->translation_keys);
			write_quat_track(ctx, (uint32_t)node, baked->rotation_keys);
			write_vec3_track(ctx, (uint32_t)node, "scale", baked->scale_keys);
		}
		for (size_t m = 0; m < ctx->mesh_count; m++) write_weights_track(ctx, bake, &ctx->meshes[m]);
	} else {
		char reason[400];
		ufbx_format_error(reason, sizeof(reason), &error);
		add_warning(ctx, "clip-not-sampled", "clip", stack->name, reason);
	}
	json_close(&ctx->json, "]");
	ufbx_free_baked_anim(bake);
}

static void write_clip(Context *ctx, const ufbx_anim_stack *stack) {
	ufbx_anim_curve **curves = NULL;
	size_t curve_count = collect_curves(ctx, stack, &curves);
	double begin = 0.0;
	double duration = clip_duration(stack, curves, curve_count, ctx->fps, &begin);
	ctx->clip_begin = begin;
	json_open(&ctx->json, "{");
	json_key(&ctx->json, "name");
	json_string(&ctx->json, stack->name);
	json_key(&ctx->json, "duration");
	json_double(&ctx->json, duration);
	write_curve_times(ctx, curves, curve_count, begin);
	write_tracks(ctx, stack);
	json_close(&ctx->json, "}");
	free(curves);
}

static void write_clips(Context *ctx) {
	Json *json = &ctx->json;
	json_key(json, "clips");
	json_open(json, "[");
	for (size_t i = 0; i < ctx->scene->anim_stacks.count; i++) write_clip(ctx, ctx->scene->anim_stacks.data[i]);
	json_close(json, "]");
}

static const char *axis_name(ufbx_coordinate_axis axis, const char *fallback) {
	switch (axis) {
	case UFBX_COORDINATE_AXIS_POSITIVE_X: return "+X";
	case UFBX_COORDINATE_AXIS_NEGATIVE_X: return "-X";
	case UFBX_COORDINATE_AXIS_POSITIVE_Y: return "+Y";
	case UFBX_COORDINATE_AXIS_NEGATIVE_Y: return "-Y";
	case UFBX_COORDINATE_AXIS_POSITIVE_Z: return "+Z";
	case UFBX_COORDINATE_AXIS_NEGATIVE_Z: return "-Z";
	default: return fallback;
	}
}

static void write_exporter(Json *json, const ufbx_metadata *metadata) {
	json_key(json, "exporter");
	ufbx_application application = metadata->latest_application;
	if (application.name.length == 0) application = metadata->original_application;
	ufbx_string name = application.name.length > 0 ? application.name : metadata->creator;
	if (name.length == 0) {
		json_null(json);
		return;
	}
	json_open(json, "{");
	json_key(json, "name");
	json_string(json, name);
	json_key(json, "version");
	if (application.name.length > 0 && application.version.length > 0) {
		json_string(json, application.version);
	} else {
		json_null(json);
	}
	json_close(json, "}");
}

static void write_space(Json *json, const ufbx_scene *scene) {
	json_key(json, "originalSpace");
	json_open(json, "{");
	json_key(json, "axes");
	json_open(json, "{");
	json_key(json, "right");
	json_cstring(json, axis_name(scene->settings.axes.right, "+X"));
	json_key(json, "up");
	json_cstring(json, axis_name(scene->settings.axes.up, "+Y"));
	json_key(json, "front");
	json_cstring(json, axis_name(scene->settings.axes.front, "+Z"));
	json_close(json, "}");
	json_key(json, "unitMeters");
	json_double(json, scene->settings.unit_meters > 0.0 ? scene->settings.unit_meters : 1.0);
	json_close(json, "}");

	json_key(json, "conversion");
	json_open(json, "{");
	json_key(json, "scale");
	json_double(json, scene->metadata.geometry_scale * scene->metadata.root_scale);
	ufbx_quat r = scene->metadata.root_rotation;
	double rotation[4] = { r.x, r.y, r.z, r.w };
	json_key(json, "rotation");
	json_floats(json, rotation, 4);
	json_close(json, "}");
}

static void write_warnings(Context *ctx) {
	const ufbx_metadata *metadata = &ctx->scene->metadata;
	if (metadata->mirror_axis != UFBX_MIRROR_AXIS_NONE) {
		add_warning(ctx, "left-handed-axes", "file", THE_FILE, NULL);
	}
	for (size_t i = 0; i < metadata->warnings.count; i++) {
		const ufbx_warning *warning = &metadata->warnings.data[i];
		char message[600];
		int length = (int)warning->description.length;
		if (warning->count > 1) {
			snprintf(message, sizeof(message), "%.*s (%zu times)", length, warning->description.data, warning->count);
		} else {
			snprintf(message, sizeof(message), "%.*s", length, warning->description.data);
		}
		add_warning(ctx, "invalid-data", "file", THE_FILE, message);
	}

	Json *json = &ctx->json;
	json_key(json, "warnings");
	json_open(json, "[");
	for (size_t i = 0; i < ctx->warning_count; i++) {
		Warning *warning = &ctx->warnings[i];
		json_open(json, "{");
		json_key(json, "code");
		json_cstring(json, warning->code);
		json_key(json, "subjectKind");
		json_cstring(json, warning->subject_kind);
		json_key(json, "subject");
		if (warning->subject) {
			json_cstring(json, warning->subject);
		} else {
			json_null(json);
		}
		json_key(json, "detail");
		if (warning->detail) {
			json_cstring(json, warning->detail);
		} else {
			json_null(json);
		}
		json_close(json, "}");
	}
	json_close(json, "]");
}

static void write_source(Context *ctx) {
	write_exporter(&ctx->json, &ctx->scene->metadata);
	json_key(&ctx->json, "fps");
	json_double(&ctx->json, ctx->fps);
	write_space(&ctx->json, ctx->scene);
	write_warnings(ctx);
}

static uint8_t *finish(Json *json, Buffer *blobs) {
	Buffer result = { 0 };
	uint32_t preamble[4] = { RESULT_MAGIC, RESULT_VERSION, (uint32_t)json->out.size, (uint32_t)blobs->size };
	buffer_write(&result, preamble, sizeof(preamble));
	buffer_write(&result, json->out.data, json->out.size);
	buffer_align(&result, 8);
	buffer_write(&result, blobs->data, blobs->size);
	free(json->out.data);
	free(blobs->data);
	return result.data;
}

static uint8_t *error_result(const char *message) {
	Json json = { 0 };
	Buffer blobs = { 0 };
	json_open(&json, "{");
	json_key(&json, "error");
	json_text(&json, message, strlen(message));
	json_close(&json, "}");
	return finish(&json, &blobs);
}

static void free_context(Context *ctx) {
	for (size_t i = 0; i < ctx->warning_count; i++) {
		free(ctx->warnings[i].subject);
		free(ctx->warnings[i].detail);
	}
	free(ctx->warnings);
	for (size_t i = 0; i < ctx->skeleton_count; i++) {
		free(ctx->skeletons[i].joints);
		free(ctx->skeletons[i].inverse_bind);
	}
	free(ctx->skeletons);
	for (size_t i = 0; i < ctx->mesh_count; i++) free(ctx->meshes[i].channels);
	free(ctx->meshes);
	free(ctx->emitted);
	free(ctx->node_index);
	free(ctx->has_bind);
	free(ctx->bind_world);
	free(ctx->rest_world);
	free(ctx->rest_local);
	free(ctx->is_joint);
	free(ctx->mesh_index);
	free(ctx->material_index);
	free(ctx->material_order);
	free(ctx->texture_file_used);
}

ARCUE_EXPORT uint8_t *arcue_import(const uint8_t *data, uint32_t size) {
	ufbx_load_opts opts = { 0 };
	opts.temp_allocator.memory_limit = PARSER_MEMORY_LIMIT;
	opts.result_allocator.memory_limit = PARSER_MEMORY_LIMIT;
	opts.target_axes = ufbx_axes_right_handed_y_up;
	opts.target_unit_meters = 1.0;
	opts.space_conversion = UFBX_SPACE_CONVERSION_MODIFY_GEOMETRY;
	opts.geometry_transform_handling = UFBX_GEOMETRY_TRANSFORM_HANDLING_PRESERVE;
	opts.inherit_mode_handling = UFBX_INHERIT_MODE_HANDLING_COMPENSATE;
	opts.pivot_handling = UFBX_PIVOT_HANDLING_RETAIN;
	opts.handedness_conversion_axis = UFBX_MIRROR_AXIS_X;
	opts.generate_missing_normals = true;
	opts.clean_skin_weights = true;
	opts.use_blender_pbr_material = true;
	opts.load_external_files = false;
	opts.ignore_missing_external_files = true;
	opts.file_format = UFBX_FILE_FORMAT_FBX;

	ufbx_error error;
	ufbx_scene *scene = ufbx_load_memory(data, size, &opts, &error);
	if (!scene) {
		char message[1024];
		ufbx_format_error(message, sizeof(message), &error);
		return error_result(message);
	}

	Context ctx = { 0 };
	ctx.scene = scene;
	ctx.fps = scene->settings.frames_per_second > 0.0 ? scene->settings.frames_per_second : 30.0;
	ctx.default_material = -1;
	ctx.material_index = (int32_t *)alloc_array(scene->materials.count, sizeof(int32_t));
	for (size_t i = 0; i < scene->materials.count; i++) ctx.material_index[i] = -1;
	ctx.material_order = (uint32_t *)alloc_array(size_add(scene->materials.count, 1), sizeof(uint32_t));
	ctx.texture_file_used = (bool *)alloc_zeroed(scene->texture_files.count, sizeof(bool));

	collect_nodes(&ctx);
	compute_rest_pose(&ctx);

	json_open(&ctx.json, "{");
	write_nodes(&ctx);
	write_meshes(&ctx);
	write_skeletons(&ctx);
	write_materials(&ctx);
	write_texture_files(&ctx);
	write_clips(&ctx);
	write_source(&ctx);
	json_close(&ctx.json, "}");

	uint8_t *result = finish(&ctx.json, &ctx.blobs);
	free_context(&ctx);
	ufbx_free_scene(scene);
	return result;
}

ARCUE_EXPORT void arcue_free(uint8_t *result) { free(result); }
