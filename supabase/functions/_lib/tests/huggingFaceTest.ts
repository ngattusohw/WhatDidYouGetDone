import HuggingFaceClient from "../clients/HuggingFaceClient";
import * as dotenv from "dotenv";

// Load .env file
dotenv.config();

(async () => {
  const client = new HuggingFaceClient();

  try {
    const model = process.env.LLM_MODEL;

    if (!model) {
      throw new Error("LLM_MODEL is not set in the .env file.");
    }

    const response = await client.chatCompletion(
      model,
      [
        {
          role: "system",
          content: "You are a helpful assistant that answers the user question concisely in just 3 sentences or less.",
        },
        {
          role: "user",
          content: "What is the capital of France?",
        },
      ],
      500
    );

    console.log("Chat Completion Response:", response.choices[0].message.content);
  } catch (error) {
    console.error("Test failed:", error);
  }
})();
