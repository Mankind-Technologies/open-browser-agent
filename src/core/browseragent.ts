import { Agent, AgentInputItem, run, RunStreamEvent, setDefaultOpenAIKey, tool, Tool } from '@openai/agents';
import { BrowserAgentProvider } from './browseragent.provider';
import z from 'zod';
import { interpretImage } from './aiFunctions';
import { agentPrompt } from './browseragent.prompt';

export type StepEvent = {
  type: 'step';
  step: RunStreamEvent;
}
export type EndEvent = {
  type: 'end';
  output: string;
  history: AgentInputItem[];
}
export type BrowserAgentEvent = StepEvent | EndEvent;

export type AgentConfig = {
  model: 'gpt-5-mini' | 'gpt-5-nano' | 'gpt-5';
  reasoningEffort: 'low' | 'medium' | 'high';
  textVerbosity: 'low' | 'medium' | 'high';
}

const defaultAgentConfig: AgentConfig = {
  model: 'gpt-5-mini',
  reasoningEffort: 'low',
  textVerbosity: 'low',
}

const baseToolSchema = z.object({
  explaining: z.string().describe('Explanation of why we are requesting to use this tool with the given parameters. Should be short and non-technical.'),
});

export class BrowserAgent {
  
  private config: AgentConfig;
  private openaiApiKey: string = '';
  private readonly ready: Promise<void>;

  constructor(private readonly provider: BrowserAgentProvider, config: Partial<AgentConfig> = {}) {
    this.ready = this.loadApiKeyFromStorage();
    this.config = { ...defaultAgentConfig, ...config };
  }

  private async loadApiKeyFromStorage(): Promise<void> {
    try {
      const { apiKey } = await chrome.storage.sync.get('apiKey');
      this.openaiApiKey = (apiKey as string) || '';
      if (this.openaiApiKey) setDefaultOpenAIKey(this.openaiApiKey);
    } catch (_) {
      this.openaiApiKey = '';
    }
  }
  private async getTools(): Promise<Tool[]> {
    const clickElementSchema = baseToolSchema.extend({
      selector: z.string().describe('The selector of the element to click')
    });
    const clickElement = tool({
      name: 'clickElement',
      description: 'Click on the element',
      parameters: clickElementSchema,
      execute: async (input: z.infer<typeof clickElementSchema>) => {
        const selector = input.selector;
        return await this.provider.clickElement(selector);
      }
    });

    const typeInSchema = baseToolSchema.extend({
      text: z.string().describe('The text to type in')
    });
    const typeInFocusedElement = tool({
      name: 'typeInFocusedElement',
      description: 'Type in the focused element',
      parameters: typeInSchema,
      execute: async (input: z.infer<typeof typeInSchema>) => {
        const { text } = input;
        return await this.provider.typeInFocusedElement(text);
      }
    });
    const findElementsWithTextSchema = baseToolSchema.extend({
      text: z.string().describe('The text to find in the page')
    });
    const findElementsWithText = tool({
      name: 'findElementsWithText',
      description: 'Find elements with the given text',
      parameters: findElementsWithTextSchema,
      execute: async (input: z.infer<typeof findElementsWithTextSchema>) => {
        const { text } = input;
        return await this.provider.findElementsWithText(text);
      }
    });
    const clickElementWithTextSchema = baseToolSchema.extend({
      text: z.string().describe('The text to find in the page')
    });
    const clickElementWithText = tool({
      name: 'clickElementWithText',
      description: 'Click on the element with the given text',
      parameters: clickElementWithTextSchema,
      execute: async (input: z.infer<typeof clickElementWithTextSchema>) => {
        const { text } = input;
        return await this.provider.clickElementWithText(text);
      }
    });
    const seePageSchema = baseToolSchema.extend({
      prompt: z.string().describe('The prompt to interpret the screenshot')
    });
    const seePage = tool({
      name: 'seePage',
      description: 'See the page and describe it',
      parameters: seePageSchema,
      execute: async (input: z.infer<typeof seePageSchema>) => {
        const { prompt } = input;
        return await interpretImage(await this.provider.takeScreenshot(), prompt);
      }
    });
    const getCurrentUrl = tool({
      name: 'getCurrentUrl',
      description: 'Get the current url of the page',
      parameters: baseToolSchema,
      execute: async () => {
        return await this.provider.getCurrentUrl();
      }
    });
    const typeInElementSchema = baseToolSchema.extend({
      selector: z.string().describe('The selector of the element to type in'),
      text: z.string().describe('The text to type in')
    });
    const typeInElement = tool({
      name: 'typeInElement',
      description: 'Type in the element',
      parameters: typeInElementSchema,
      execute: async (input: z.infer<typeof typeInElementSchema>) => {
        const { selector, text } = input;
        return await this.provider.typeInElement(selector, text);
      }
    });
    const goBack = tool({
      name: 'goBack',
      description: 'Go back to the previous page',
      parameters: baseToolSchema,
      execute: async () => {
        return await this.provider.goBack();
      }
    });
    const scrollSchema = baseToolSchema.extend({
      direction: z.enum(['up', 'down']).describe('The direction to scroll')
    });
    const scroll = tool({
      name: 'scroll',
      description: 'Scroll the page',
      parameters: scrollSchema,
      execute: async (input: z.infer<typeof scrollSchema>) => {
        const { direction } = input;
        return await this.provider.scroll(direction);
      }
    });
    const openUrlSchema = baseToolSchema.extend({
      url: z.string().describe('The url to open')
    });
    const openUrl = tool({
      name: 'openUrl',
      description: 'Open the given url',
      parameters: openUrlSchema,
      execute: async (input: z.infer<typeof openUrlSchema>) => {
        const { url } = input;
        return await this.provider.openUrl(url);
      }
    });
    return [
      clickElement,
      typeInFocusedElement,
      findElementsWithText,
      clickElementWithText,
      seePage,
      getCurrentUrl,
      //typeInElement,
      goBack,
      scroll,
      openUrl,
    ];
  }

  async *run(task: string, startingHistory?: AgentInputItem[]): AsyncGenerator<BrowserAgentEvent> {
    await this.ready;
    const url = await this.provider.getCurrentUrl();
    const agent = new Agent({
      model: this.config.model,
      name: 'Open Browser Agent',
      instructions: agentPrompt({ url }),
      tools: await this.getTools(),    modelSettings: {
        providerData: {
          reasoning: {
            effort: this.config.reasoningEffort,
            summary: 'auto',
          },
          text: {
            verbosity: this.config.textVerbosity,
          },
        },
      },
    });
    const newHistory: AgentInputItem[] = Array.isArray(startingHistory) ? [...startingHistory] : [];
    newHistory.push({
      role: 'user',
      content: task,
    });
    const result = await run(agent, newHistory, {
      maxTurns: 50,
      stream: true,
    });
    for await (const event of result) {
      yield { type: 'step', step: event };
    }
    yield { type: 'end', output: result.finalOutput ?? '', history: result.history };
  }
}