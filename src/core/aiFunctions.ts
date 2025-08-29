import OpenAI from "openai";


const getOpenAiClient = async () => {
    const { apiKey } = await chrome.storage.sync.get('apiKey');
    const openaiApiKey = (apiKey as string) || '';
    const openai = new OpenAI({
        apiKey: openaiApiKey,
    });
    return openai;
}

export const interpretImageDiff = async (image1: string, image2: string) => {
    const openai = await getOpenAiClient();
    const response = await openai.responses.create({
        model: "gpt-5-nano",
        reasoning: {
            effort: "low",
        },
        input: [
            {
                role: "system",
                content: "You are a helpful assistant that interprets screenshots. You are given two screenshots of the same page, and you need to describe the changes between them; the first one is the initial one, the second one is the one after an action (click, scroll, type, etc.) is performed. Also provide a general description of the end state of the page."
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_text",
                        text: "The initial image:"
                    },
                    {
                        type: "input_image",
                        image_url: image1,
                        detail: "low"
                    },
                    {
                        type: "input_text",
                        text: "The image after the action:"
                    },
                    {
                        type: "input_image",
                        image_url: image2,
                        detail: "low"
                    }
                ]
            }
        ]
    });
    return response.output_text;
}


export const interpretImage = async (image: string, prompt: string) => {
    // ensure that the image is a valid base64 image
    if (!image.startsWith('data:image/')) {
        image = `data:image/png;base64,${image}`;
    }
    const openai = await getOpenAiClient();
    const response = await openai.responses.create({
        model: "gpt-5-nano",
        reasoning: {
            effort: "low",
        },
        input: [
            {
                role: "system",
                content: "You are a helpful assistant that interprets screenshots. See the screenshot and the prompt, and return a description of the screenshot. Also write a detailed generic description of the content of the page, including main actions, titles, cards, etc."
            },
            {
                role: "user",
                content: [
                    {
                        type: "input_image",
                        image_url: image,
                        detail: "low"
                    },
                    {
                        type: "input_text",
                        text: prompt
                    }
                ]
            }
        ]
    });
    return response.output_text;
}