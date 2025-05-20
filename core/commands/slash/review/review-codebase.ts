import * as fs from "fs";
import * as path from "node:path";
import * as os from "os";

import { ContextProviderExtras, ContinueSDK, SlashCommand } from "../../../index.js";
import { renderChatMessage } from "../../../util/messageContent.js";

const CONTINUE_GLOBAL_DIR = path.join(os.homedir(), ".epico-pilot");


async function getCodebase(sdk: ContinueSDK) {
  const { retrieveContextItemsFromEmbeddings } = await import(
    "../../../context/retrieval/retrieval.js"
  );
  const extras = {
    config: sdk.config,
    llm: sdk.llm,
    embeddingsProvider: sdk.config?.selectedModelByRole?.embed,
    fullInput: "",
    ide: sdk.ide,
    selectedCode: sdk.selectedCode,
    reranker: sdk.config?.selectedModelByRole?.rerank,
    fetch,
  } as ContextProviderExtras;

  const codebaseArray = await retrieveContextItemsFromEmbeddings(extras, { nRetrieve: 300, nFinal: 300 }, undefined);
  const codebase = codebaseArray.map(c => c.content).join('\n');
  
  return codebase;
}

// code to send context to ollama (experimental)
async function sendCodeToOllama(sdk: ContinueSDK) {
  const { retrieveContextItemsFromEmbeddings } = await import(
    "../../../context/retrieval/retrieval.js"
  );
  const extras = {
    config: sdk.config,
    llm: sdk.llm,
    embeddingsProvider: sdk.config?.selectedModelByRole?.embed,
    fullInput: "",
    ide: sdk.ide,
    selectedCode: sdk.selectedCode,
    reranker: sdk.config?.selectedModelByRole?.rerank,
    fetch,
  } as ContextProviderExtras;

  const codebaseArray = await retrieveContextItemsFromEmbeddings(extras, { nRetrieve: 300, nFinal: 300 }, undefined);
  const codebase = codebaseArray.map(c => c.content).join('');
  let context = [];

  // Split codebase into chunks of ~10,000 characters
  let chunks = codebase.match(/[\s\S]{1,7000}/g) || [codebase];

  console.log(`Sending ${chunks.length} chunks to Ollama...`);

  let session = null;
  const devDataDir = path.join(CONTINUE_GLOBAL_DIR, "dev_data");
  const sessionPath = path.join(devDataDir, "session.jsonl");
  try {
    session = JSON.parse(fs.readFileSync(
      sessionPath,
      "utf8"
    ));
  } catch {
    console.log("Error:", "No session file found!");
  }

  const apiKey = session.apiKey;

  for (let chunk of chunks) {
      const payload = {
        model: sdk.llm?.model,
        messages: [{ role: "user", content: chunk }],
        context
      };

      try {
          const response: Response = await fetch(`${sdk.llm?.model}/api/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
          });
          context = (await response.json()).context; // Update context with each request
      } catch (error) {
          console.error("Error:", error);
          break;
      }
  }

  return context; // Return the final context for follow-up questions
}

const ReviewCodebaseMessageCommand: SlashCommand = {
  name: "review:codebase",
  description: "Review entire codebase and give feedback",
  run: async function* (sdk) {
    const codebase = await getCodebase(sdk);
    const prompt = createReviewPrompt(codebase);

    console.log("prompt", prompt)

    for await (const chunk of sdk.llm.streamChat(
      [{ role: "user", content: prompt }],
      new AbortController().signal,
    )) {
      yield renderChatMessage(chunk);
    }
  },
};

function createReviewPrompt(codebase: string): string {
  return `
  ### Context
  ${codebase}

  ### Question
  You are a code review assistant. Analyze the above provided codebase and generate a detailed review covering the following aspects. Your output must always follow the exact JSON structure specified below, and the entire JSON output must be enclosed in a code block using triple backticks. Do not output any text outside of the code block.

  For each review category:
  - Only list a maximum of 3 issues. If more issues exist, list only the top 3 prioritized by severity (High, Medium, Low).
  - Each issue must include a detailed description with specific instructions such as file name, line number, variable names, and any other specific details.
  - Each issue must also include a "Severity" field (possible values: "High", "Medium", "Low").
  - Similarly, provide detailed recommendations that include specific instructions (file name, line number, variable names, etc.) along with a "Severity" field if applicable.
  - Include a disclaimer in your output stating: "Disclaimer: Only top 3 issues per category are shown, prioritized by severity. Additional issues may exist."

  The review must cover the following sections:

  1. **Naming Conventions**
    - Evaluate if variable, function, and class names are consistent, descriptive, and follow a standard naming pattern.
    - Provide detailed issues (with file name, line number, variable names, etc.) and recommendations.

  2. **Duplications**
    - Identify any duplicate code segments or functionality that could be refactored.
    - Provide detailed issues and recommendations.

  3. **Proper Comments for All Activities**
    - Check that every significant piece of code has clear, helpful comments.
    - Specifically review the sections for "Add functions" and "Delete functions" and comment on their adequacy.
    - Provide detailed issues and recommendations for each sub-section (AddFunctions and DeleteFunctions).

  4. **Memory Leaks**
    - Identify potential memory leaks such as unused arrays or improperly managed memory.
    - Provide detailed issues and recommendations.

  5. **Unnecessary Files**
    - Identify any files in the codebase that appear to be redundant or unnecessary.
    - Provide detailed issues and recommendations.

  6. **PR Summary**  
   - Review commit messages and pull request summaries for clarity and completeness.
   - Provide detailed issues and recommendations.

  7. **HIPAA/GDPR Compliance**  
   - Evaluate the code for compliance with HIPAA and GDPR regulations.
   - Provide separate detailed findings and recommendations for HIPAA and GDPR compliance.

  8. **Logging**  
   - Review the logging practices throughout the code.
   - Ensure that logs are meaningful and balanced.
   - Provide detailed issues and recommendations.

  9. **Refactoring**  
   - Provide overall recommendations to improve code structure, readability, and maintainability.
   - Identify areas where refactoring would significantly improve the code.
   - Provide detailed issues and recommendations.

  Your output must strictly adhere to the JSON structure provided below, including all specified keys. Do not output any text besides the JSON in a single code block.

  **Output JSON Structure:**

  \`\`\`
  {
    "Disclaimer": "Only top 3 issues per category are shown, prioritized by severity. Additional issues may exist.",
    "NamingConventions": {
      "Issues": [
        {
          "Description": "Detailed description including file name, line number, variable/function/class names, etc.",
          "File": "File name where the issue was found",
          "Line": "Line number(s) where the issue was detected",
          "Severity": "High/Medium/Low"
        }
        // Up to 3 issues
      ],
      "Recommendations": [
        {
          "Description": "Detailed recommendation with specific instructions including file name, line number, etc.",
          "File": "File name relevant to the recommendation",
          "Line": "Line number(s) if applicable",
          "Severity": "High/Medium/Low"
        }
        // Corresponding recommendations
      ]
    },
    "Duplications": {
      "Issues": [
        {
          "Description": "Detailed description including file name, line number, etc.",
          "File": "File name where the duplication was found",
          "Line": "Line number(s) where the duplication occurs",
          "Severity": "High/Medium/Low"
        }
      ],
      "Recommendations": [
        {
          "Description": "Detailed recommendation with specific instructions to refactor duplicate code.",
          "File": "Relevant file name",
          "Line": "Line number(s) if applicable",
          "Severity": "High/Medium/Low"
        }
      ]
    },
    "ProperComments": {
      "AddFunctions": {
        "Issues": [
          {
            "Description": "Detailed description of missing or inadequate comments in add functions (include file, line, etc.).",
            "File": "File name",
            "Line": "Line number(s)",
            "Severity": "High/Medium/Low"
          }
        ],
        "Recommendations": [
          {
            "Description": "Detailed recommendation to improve comments in add functions with specific instructions.",
            "File": "Relevant file name",
            "Line": "Line number(s)",
            "Severity": "High/Medium/Low"
          }
        ]
      },
      "DeleteFunctions": {
        "Issues": [
          {
            "Description": "Detailed description of missing or inadequate comments in delete functions (include file, line, etc.).",
            "File": "File name",
            "Line": "Line number(s)",
            "Severity": "High/Medium/Low"
          }
        ],
        "Recommendations": [
          {
            "Description": "Detailed recommendation to improve comments in delete functions with specific instructions.",
            "File": "Relevant file name",
            "Line": "Line number(s)",
            "Severity": "High/Medium/Low"
          }
        ]
      }
    },
    "MemoryLeaks": {
      "Issues": [
        {
          "Description": "Detailed description of potential memory leaks including file, line number, and affected variable/array names.",
          "File": "File name",
          "Line": "Line number(s)",
          "Severity": "High/Medium/Low"
        }
      ],
      "Recommendations": [
        {
          "Description": "Detailed recommendation to resolve the memory leak with specific instructions.",
          "File": "Relevant file name",
          "Line": "Line number(s)",
          "Severity": "High/Medium/Low"
        }
      ]
    },
    "UnnecessaryFiles": {
      "Issues": [
        {
          "Description": "Detailed description of the unnecessary file, including file name and reason why it's redundant.",
          "File": "File name",
          "Line": "N/A",
          "Severity": "High/Medium/Low"
        }
      ],
      "Recommendations": [
        {
          "Description": "Detailed recommendation to remove or consolidate the unnecessary file with specific instructions.",
          "File": "Relevant file name",
          "Line": "N/A",
          "Severity": "High/Medium/Low"
        }
      ]
    },
    "Logging": {
      "Issues": [
        {
          "Description": "Detailed description of logging issues including file name, line number, and specifics about verbosity or missing logs.",
          "File": "File name",
          "Line": "Line number(s)",
          "Severity": "High/Medium/Low"
        }
      ],
      "Recommendations": [
        {
          "Description": "Detailed recommendation to improve logging practices with specific instructions.",
          "File": "Relevant file name",
          "Line": "Line number(s)",
          "Severity": "High/Medium/Low"
        }
      ]
    }
  }
  \`\`\`

  Please generate the review following the above structure. Do not output the prompt text or any translations—only produce the JSON review with your findings based on the code, and ensure that your entire output is enclosed within a code block using triple backticks.
`;
}

export default ReviewCodebaseMessageCommand;
