import { openClawConfigReader } from './OpenClawConfigReader.js';

class GatewayApiClient {
  async sendPrompt(agentId: string, prompt: string): Promise<{ success: boolean; message?: string; error?: string }> {
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
        const errorText = await response.text();
        return {
          success: false,
          error: `Gateway returned ${response.status}: ${errorText}`,
        };
      }

      return {
        success: true,
        message: `Prompt sent to ${agentId}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[GatewayApi] Failed to send prompt to ${agentId}:`, errorMessage);
      return {
        success: false,
        error: `Failed to reach gateway: ${errorMessage}`,
      };
    }
  }
}

export const gatewayApiClient = new GatewayApiClient();
