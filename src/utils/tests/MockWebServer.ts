import { http, HttpResponse, RequestHandler } from "msw";
import { SetupServer, setupServer } from "msw/node";

export type Method = "get" | "post" | "put";

export interface MockHandler<T> {
    method: Method;
    endpoint: string;
    httpStatusCode: number;
    response: T | ((req: Request) => T);
}

export interface Request {
    headers: Record<string, string>;
    params: URLSearchParams;
    url: URL;
}

export class MockWebServer {
    server: SetupServer;

    lastRequest?: Request;
    allRequests?: Request[] = [];

    constructor() {
        this.server = setupServer();
    }

    start(options?: { onUnhandledRequest?: "bypass" | "warn" | "error" }): void {
        this.server.listen({ onUnhandledRequest: options?.onUnhandledRequest ?? "bypass" });
    }

    resetHandlers(): void {
        this.server.resetHandlers();
        this.resetRequests();
    }

    resetRequests(): void {
        this.lastRequest = undefined;
        this.allRequests = [];
    }

    close(): void {
        this.server.close();
    }

    addRequestHandlers<T>(handlers: MockHandler<T>[]) {
        const mwsHandlers = handlers.map(handler => this.createMwsHandler(handler));
        this.server.use(...mwsHandlers);
    }

    createMwsHandler<T>(handler: MockHandler<T>): RequestHandler {
        // NOTE: the `as any` on the resolver is the only deviation from the shared wrapper (see
        // dashboard-reports, which is otherwise identical). MSW 2 requires TypeScript >= 4.8 and
        // this project is still on 4.5: HttpResponse extends the native Response, and the DOM lib
        // in 4.5 predates its body being an async-iterable ReadableStream, so the resolver never
        // matches HttpResponseResolver. Runtime behaviour is unaffected. Remove the cast once
        // TypeScript is upgraded (tracked with the other follow-ups in the PR description).
        const resolver = ({ request }: { request: globalThis.Request }) => {
            const mappedRequest = this.mapRequest(request);
            this.lastRequest = mappedRequest;
            this.allRequests?.push(mappedRequest);

            const body =
                typeof handler.response === "function" ? (handler.response as any)(mappedRequest) : handler.response;

            return typeof body === "string"
                ? new HttpResponse(body, { status: handler.httpStatusCode })
                : HttpResponse.json(body as any, { status: handler.httpStatusCode });
        };

        switch (handler.method) {
            case "get":
                return http.get(handler.endpoint, resolver as any);
            case "post":
                return http.post(handler.endpoint, resolver as any);
            case "put":
                return http.put(handler.endpoint, resolver as any);
        }
    }

    mapRequest(req: globalThis.Request): Request {
        const url = new URL(req.url);
        return {
            headers: Object.fromEntries(req.headers.entries()),
            params: url.searchParams,
            url,
        };
    }
}
