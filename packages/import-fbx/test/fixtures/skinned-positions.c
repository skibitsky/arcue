// Prints ufbx's own skinned positions of every 97th control point of the first mesh, in scene space, at the given
// frames of one take, as the reference for the posed-skinning test. Build it natively against vendor/ufbx:
//   clang -O1 -I../../vendor/ufbx skinned-positions.c ../../vendor/ufbx/ufbx.c -lm -o skinned-positions
//   ./skinned-positions ../../../../samples/pebble-golem-sparse.fbx "Armature|Walk" 7 7.5 > golem-sparse-walk.json
#include <stdio.h>
#include <stdlib.h>
#include "ufbx.h"

int main(int argc, char **argv) {
	if (argc < 4) return 1;
	ufbx_load_opts opts = { 0 };
	opts.target_axes = ufbx_axes_right_handed_y_up;
	opts.target_unit_meters = 1.0;
	opts.space_conversion = UFBX_SPACE_CONVERSION_MODIFY_GEOMETRY;
	opts.inherit_mode_handling = UFBX_INHERIT_MODE_HANDLING_COMPENSATE;
	opts.handedness_conversion_axis = UFBX_MIRROR_AXIS_X;
	opts.clean_skin_weights = true;
	ufbx_error error;
	ufbx_scene *scene = ufbx_load_file(argv[1], &opts, &error);
	if (!scene) return 1;
	ufbx_anim_stack *stack = ufbx_find_anim_stack(scene, argv[2]);
	if (!stack) return 1;
	printf("{\"clip\":\"%s\",\"frames\":[", argv[2]);
	for (int f = 3; f < argc; f++) {
		double frame = atof(argv[f]);
		double time = stack->time_begin + frame / scene->settings.frames_per_second;
		ufbx_evaluate_opts eval = { 0 };
		eval.evaluate_skinning = true;
		ufbx_scene *state = ufbx_evaluate_scene(scene, stack->anim, time, &eval, &error);
		if (!state) return 1;
		ufbx_mesh *mesh = state->meshes.data[0];
		printf("%s{\"frame\":%g,\"positions\":[", f > 3 ? "," : "", frame);
		for (size_t v = 0; v < mesh->num_vertices; v += 97) {
			ufbx_vec3 p = mesh->skinned_position.values.data[v];
			if (mesh->skinned_is_local) p = ufbx_transform_position(&mesh->instances.data[0]->geometry_to_world, p);
			printf("%s[%zu,%.7f,%.7f,%.7f]", v ? "," : "", v, p.x, p.y, p.z);
		}
		printf("]}");
		ufbx_free_scene(state);
	}
	printf("]}\n");
	ufbx_free_scene(scene);
	return 0;
}
