export type ElementBriefing = {
    selector: string;
    text: string;
    isVisible: boolean;
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}
export type ClickElementWithTextOutput = {
    clicked: true;
    urlChanged: false;
} | {
    clicked: true;
    urlChanged: true;
    newUrl: string;
} | {
    clicked: false;
    reason: "not found";
} | {
    clicked: false;
    reason: "multiple found";
    foundElements: ElementBriefing[];
}

export type TypeInElementOutput = {
    typed: true;
} | {
    typed: false;
    reason: "not found";
} | {
    typed: false;
    reason: "multiple found";
    foundElements: ElementBriefing[];
} | {
    typed: false;
    reason: "not editable";
};

export type GoBackOutput = {
    wentBack: true;
    newUrl: string;
} | {
    wentBack: false;
};

export type ScrollOutput = {
    scrolled: true;
    direction: 'up' | 'down';
} | {
    scrolled: false;
    reason: "already at the top" | "already at the bottom";
};

export interface BrowserAgentProvider {
    /**
     * @returns the screenshot of the current page in base64
     */
    takeScreenshot(): Promise<string>;
    /**
     * @param selector - the selector of the element to click
     * @returns true if the element was found and clicked, false otherwise
     */
    clickElement(selector: string): Promise<boolean>;

    /**
     * @param text - the text to type in
     * @returns true if the element was found and typed in, false otherwise
     */
    typeInFocusedElement(text: string): Promise<boolean>;

    /**
     * @param selector - the selector of the element to type in
     * @param text - the text to type in
     * @returns true if the element was found and typed in, false otherwise
     */
    typeInElement(selector: string, text: string): Promise<TypeInElementOutput>;

    /**
     * @param text - the text to find in the page
     * @returns the selectors of the elements found
     */
    findElementsWithText(text: string): Promise<ElementBriefing[]>;

    /**
     * @param selector - the selector of the element to click
     * @returns true if the element was found and clicked, false otherwise
     */
    clickElementWithText(text: string): Promise<ClickElementWithTextOutput>;

    /**
     * @returns the current url of the page
     */
    getCurrentUrl(): Promise<string>;

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
    openUrl(url: string): Promise<boolean>;
}