export { authRouter } from "./router.js";
export { requireAuth } from "./middleware.js";
export { AUTH_COOKIE_NAME } from "./jwt.js";
// Ambient declaration merging for `Express.Request.user` (see types.d.ts).
// `middleware.ts` already imports it for its side effect, which is enough to
// pull the augmentation into any program that includes this module.
