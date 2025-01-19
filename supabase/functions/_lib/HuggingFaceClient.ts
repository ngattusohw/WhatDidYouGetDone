import { HfInference } from '@huggingface/inference';

export class HuggingFaceClient {
  private client: HfInference;

  constructor(token: string) {
    if (!token) {
      throw new Error('Hugging Face API token is missing. Set it in the .env file.');
    }
    this.client = new HfInference(token);
  }

  async chatCompletion(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens = 500
  ): Promise<any> {
    try {
      const response = await this.client.chatCompletion({
        model,
        messages,
        max_tokens: maxTokens,
      });
      return response;
    } catch (error) {
      console.error('Error in chatCompletion:', error);
      throw new Error(`Failed to fetch chat completion: ${error}`);
    }
  }
}

export default HuggingFaceClient;
