import { INestApplicationContext, Injectable, Logger } from "@nestjs/common";
import { AuthService } from "src/core/auth/auth.service";
import { JwtService } from "@nestjs/jwt";

/**
 * Custom Socket.io adapter for WebSocket authentication
 */
@Injectable()
export class DashboardWebSocketAuthAdapter {
  private readonly logger = new Logger(DashboardWebSocketAuthAdapter.name);
  private authService: AuthService | null = null;
  private jwtService: JwtService | null = null;

  constructor(private readonly appContext: INestApplicationContext) {
    // Get services from app context
    try {
      this.authService = this.appContext.get(AuthService, { strict: false });
      this.jwtService = this.appContext.get(JwtService, { strict: false });
    } catch (error) {
      this.logger.warn("Auth services not available in WebSocket adapter");
    }
  }

  /**
   * Verify authentication for a socket connection
   */
  async authenticate(socket: any): Promise<boolean> {
    try {
      // Extract token from handshake
      const token = this.extractToken(socket);

      if (!token) {
        this.logger.warn(`No token provided for socket ${socket.id}`);
        return false;
      }

      // Verify JWT token
      if (this.jwtService) {
        const payload = this.jwtService.verify(token);

        // Check if user exists and is valid
        if (payload.sub || payload.userId) {
          const userId = payload.sub || payload.userId;

          // Attach user info to socket
          socket.user = {
            id: userId,
            ...payload,
          };

          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.error(
        `Authentication failed for socket ${socket.id}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Extract token from socket handshake
   */
  private extractToken(socket: any): string | null {
    // Try authorization header
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    // Try auth object
    const authToken = socket.handshake.auth?.token;
    if (authToken) {
      return authToken;
    }

    // Try query parameter
    const queryToken = socket.handshake.query?.token;
    if (typeof queryToken === "string") {
      return queryToken;
    }

    return null;
  }

  /**
   * Get user ID from socket
   */
  getUserId(socket: any): string | null {
    return socket.user?.id || null;
  }

  /**
   * Check if socket is authenticated
   */
  isAuthenticated(socket: any): boolean {
    return socket.user !== undefined;
  }
}

// Export a static method for Socket.io adapter pattern
export function createWsAuthAdapter(appContext: INestApplicationContext) {
  return new DashboardWebSocketAuthAdapter(appContext);
}

// Monkey-patch the Server to use the adapter
export function setupAdapter(
  server: any,
  adapter: DashboardWebSocketAuthAdapter,
) {
  server.adapter = adapter;
}



