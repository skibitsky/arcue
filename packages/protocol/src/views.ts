import { z } from "zod";

/** The query parameter of a page's address, and of its socket's, that names the view the page shows. */
export const VIEW_PARAMETER = "view";

/**
 * The name of an agent session's view, such as "3f9a0c1d2b4e". The page at `?view=<name>` shows the models that
 * session opens, and only those.
 */
export const viewNameSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,64}$/, "A view name is 1 to 64 lowercase letters, digits and dashes.");

/**
 * The address of a view's page on the server at an origin such as "http://localhost:4530", for a view name the schema
 * accepts: "http://localhost:4530/?view=3f9a0c1d2b4e".
 */
export function viewAddress(origin: string, view: string): string {
  return `${origin.replace(/\/+$/, "")}/?${VIEW_PARAMETER}=${view}`;
}
