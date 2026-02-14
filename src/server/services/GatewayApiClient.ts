import { openClawConfigReader } from './OpenClawConfigReader.js';

export interface GatewayResult {
  success: boolean;
  message?: string;
  error?: string;
  errorCategory?: 'auth' | 'not_found' | 'server' | 'network' | 'unknown';
}

class GatewayApiClient {
  async sendPrompt(agentId: string, prompt: string): Promise<GatewayResult> {
    try {
      const gatewayUrl = await openClawConfigReader.getGatewayUrl();
      const token = await openClawConfigReader.getGatewayToken();

      const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'x-openclaw-agent-id': agentId,
        },
        body: JSON.stringify({
          model: `openclaw:${agentId}`,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const truncatedBody = errorBody.length > 200 ? errorBody.slice(0, 200) + '...' : errorBody;

        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: `Authentication failed (${response.status}): ${truncatedBody}`,
            errorCategory: 'auth',
          };
        }
        if (response.status === 404) {
          return {
            success: false,
            error: `Agent not found on gateway (404): ${truncatedBody}`,
            errorCategory: 'not_found',
          };
        }
        if (response.status >= 500) {
          return {
            success: false,
            error: `Gateway server error (${response.status}): ${truncatedBody}`,
            errorCategory: 'server',
          };
        }
        return {
          success: false,
          error: `Gateway returned ${response.status}: ${truncatedBody}`,
          errorCategory: 'unknown',
        };
      }

      // Parse the response body to extract assistant content
      let assistantPreview: string | undefined;
      try {
        const body = await response.json();
        const content = body?.choices?.[0]?.message?.content;
        if (typeof content === 'string' && content.length > 0) {
          assistantPreview = content.length > 120 ? content.slice(0, 120) + '...' : content;
        }
      } catch {
        // Non-JSON body or parse error — that's fine, we still got 200 OK
      }

      const message = assistantPreview
        ? `Prompt delivered to ${agentId} — response: ${assistantPreview}`
        : `Prompt delivered to ${agentId}`;

      return { success: true, message };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[GatewayApi] Failed to send prompt to ${agentId}:`, errorMessage);
      return {
        success: false,
        error: `Failed to reach gateway: ${errorMessage}`,
        errorCategory: 'network',
      };
    }
  }
}

export const gatewayApiClient = new GatewayApiClient();
