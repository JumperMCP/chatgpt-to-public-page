import { provider } from "./oauth";
import { Problem, publicError, type Env } from "./types";
export { Publisher } from "./publisher";
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.origin !== env.PUBLISHER_ORIGIN)
        return new Response("Unexpected host", { status: 400 });
      const origin = request.headers.get("origin");
      if (origin && origin !== env.PUBLISHER_ORIGIN)
        return new Response("Unexpected origin", { status: 403 });
      return await provider(env).fetch(request, env, ctx);
    } catch (error) {
      return Response.json(publicError(error), {
        status: error instanceof Problem ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      });
    }
  },
} satisfies ExportedHandler<Env>;
