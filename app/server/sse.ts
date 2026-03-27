import type { Response } from "express";

class SSEManager {
  private clients: Set<Response> = new Set();

  addClient(res: Response): void {
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  broadcast(data: Record<string, unknown>): void {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((client) => {
      client.write(message);
    });
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const sseManager = new SSEManager();
