import readline from "node:readline";

export interface JsonRpcRequest {
  jsonrpc: string;
  id?: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number | string | null;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number | string | null;
  error: {
    code: number;
    message: string;
  };
}

export type MethodHandler = (params: unknown) => Promise<unknown>;

export class JsonRpcServer {
  private readonly handlers = new Map<string, MethodHandler>();
  private closed = false;

  register(method: string, handler: MethodHandler) {
    this.handlers.set(method, handler);
  }

  start() {
    const input = readline.createInterface({
      input: process.stdin,
      crlfDelay: Infinity
    });

    input.on("line", (line) => {
      void this.handleLine(line);
    });
    input.on("close", () => {
      this.closed = true;
    });
  }

  private async handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed || this.closed) {
      return;
    }

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      this.write({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error"
        }
      });
      return;
    }

    if (!request.method || request.jsonrpc !== "2.0") {
      this.write({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32600,
          message: "Invalid request"
        }
      });
      return;
    }

    const handler = this.handlers.get(request.method);
    if (!handler) {
      this.write({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`
        }
      });
      return;
    }

    try {
      const result = await handler(request.params);
      if (request.id !== undefined) {
        this.write({
          jsonrpc: "2.0",
          id: request.id,
          result: result ?? null
        });
      }
    } catch (error) {
      if (request.id !== undefined) {
        this.write({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : "Method failed"
          }
        });
      }
    }
  }

  private write(response: JsonRpcSuccess | JsonRpcFailure) {
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

export function log(message: string) {
  process.stderr.write(`[markdown-archive] ${message}\n`);
}
