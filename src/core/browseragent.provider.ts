export type ElementBriefing = {
    selector: string;
    text: string;
    isVisible: boolean;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}

export type BaseOutputAction = {
    success: boolean;
    whatChangedOnScreen: string;
}

export type ClickElementWithTextOutput = BaseOutputAction & {
    success: true;
    urlChanged: false;
} | {
    success: true;
    urlChanged: true;
    newUrl: string;
} | {
    success: false;
    reason: "not found";
} | {
    success: false;
    reason: "multiple found";
    foundElements: ElementBriefing[];
}

export type TypeInElementOutput = BaseOutputAction & {
    success: true;
} | {
    success: false;
    reason: "not found";
} | {
    success: false;
    reason: "multiple found";
    foundElements: ElementBriefing[];
} | {
    success: false;
    reason: "not editable";
};

export type GoBackOutput = BaseOutputAction & {
    success: true;
    newUrl: string;
} | {
    success: false;
};

export type ScrollOutput = BaseOutputAction & {
    success: true;
    direction: 'up' | 'down';

} | {
    success: false;
    reason: "already at the top" | "already at the bottom";
};

export type OpenUrlOutput = BaseOutputAction & {
    success: true;
    newUrl: string;
} | {
    success: false;
    reason: "invalid url";
};

export type ClickElementOutput = BaseOutputAction & {
    success: true;
} | {
    success: false;
    reason: "not found";
} | {
    success: false;
    reason: "multiple found";
    foundElements: ElementBriefing[];
};

export type TypeInFocusedElementOutput = BaseOutputAction & {
    success: true;
};

export interface BrowserAgentProvider {
    /**
     * @param selector - the selector of the element to click
     * @returns true if the element was found and clicked, false otherwise
     */
    clickElement(selector: string): Promise<ClickElementOutput>;
    /**
     * @param text - the text to type in
     * @returns true if the element was found and typed in, false otherwise
     */
    typeInFocusedElement(text: string): Promise<TypeInFocusedElementOutput>;
    /**
     * @param selector - the selector of the element to type in
     * @param text - the text to type in
     * @returns true if the element was found and typed in, false otherwise
     */
    typeInElement(selector: string, text: string): Promise<TypeInElementOutput>;

    /**
     * @param selector - the selector of the element to click
     * @returns true if the element was found and clicked, false otherwise
     */
    clickElementWithText(text: string): Promise<ClickElementWithTextOutput>;

    /**
     * @returns true if the browser went back, false otherwise
     */
    goBack(): Promise<GoBackOutput>;

    /**
     * @param direction - the direction to scroll
     * @returns true if the scroll was successful, false otherwise
     */
    scroll(direction: 'up' | 'down'): Promise<ScrollOutput>;

    /**
     * @param url - the url to open
     * @returns true if the url was opened, false otherwise
     */
    openUrl(url: string): Promise<OpenUrlOutput>;


    /**
     * @returns the screenshot of the current page in base64
     */
    takeScreenshot(): Promise<string>;
    /**
     * @param text - the text to find in the page
     * @returns the selectors of the elements found
     */
    findElementsWithText(text: string): Promise<ElementBriefing[]>;

    /**
     * @returns the current url of the page
     */
    getCurrentUrl(): Promise<string>;
}