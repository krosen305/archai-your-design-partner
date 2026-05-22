/**
 * react-test-setup.ts
 *
 * Initialises a happy-dom Browser environment for React component tests.
 * Import this as the FIRST line of every *.react.test.tsx / *.test.tsx
 * file that renders React components.
 *
 * Strategy:
 * 1. Create a Browser + BrowserPage so the window is fully self-wired.
 * 2. Patch the happy-dom window's Error family to use native constructors —
 *    this makes happy-dom internals (querySelectorAll etc.) work, while
 *    keeping React's own Error references intact.
 * 3. Assign DOM globals so @testing-library/dom can find document, window, etc.
 */
import "@testing-library/jest-dom";
import { Browser } from "happy-dom";

const browser = new Browser({
  settings: {
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
  },
});
const page = browser.newPage();
const happyWindow = page.mainFrame.window;

// Patch happy-dom's internal Error constructors to native ones so that
// happy-dom's querySelectorAll can call `new this.window.SyntaxError(...)`.
// Do NOT replace global.Error — React (dev build) uses global Error directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = happyWindow as any;
w.Error = Error;
w.TypeError = TypeError;
w.SyntaxError = SyntaxError;
w.RangeError = RangeError;
w.ReferenceError = ReferenceError;
w.EvalError = EvalError;
w.URIError = URIError;

// Wire globals expected by @testing-library/dom and @testing-library/react
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = global as any;

g.window = happyWindow;
g.document = happyWindow.document;
g.navigator = happyWindow.navigator;
g.location = happyWindow.location;
g.screen = happyWindow.screen;
g.history = happyWindow.history;

// DOM classes
g.Element = happyWindow.Element;
g.HTMLElement = happyWindow.HTMLElement;
g.HTMLInputElement = happyWindow.HTMLInputElement;
g.HTMLTextAreaElement = happyWindow.HTMLTextAreaElement;
g.SVGElement = happyWindow.SVGElement;
g.Node = happyWindow.Node;
g.NodeFilter = happyWindow.NodeFilter;
g.Text = happyWindow.Text;
g.Comment = happyWindow.Comment;
g.DocumentFragment = happyWindow.DocumentFragment;
g.DOMException = happyWindow.DOMException;
g.MutationObserver = happyWindow.MutationObserver;
g.ResizeObserver = happyWindow.ResizeObserver;
g.IntersectionObserver = happyWindow.IntersectionObserver;
g.CustomEvent = happyWindow.CustomEvent;
g.Event = happyWindow.Event;
g.MouseEvent = happyWindow.MouseEvent;
g.KeyboardEvent = happyWindow.KeyboardEvent;
g.PointerEvent = happyWindow.PointerEvent;
g.FocusEvent = happyWindow.FocusEvent;
g.InputEvent = happyWindow.InputEvent;
g.Storage = happyWindow.Storage;
g.URL = happyWindow.URL;
g.URLSearchParams = happyWindow.URLSearchParams;
g.Blob = happyWindow.Blob;
g.File = happyWindow.File;
g.FormData = happyWindow.FormData;
g.Headers = happyWindow.Headers;
g.Request = happyWindow.Request;
g.Response = happyWindow.Response;
g.ClipboardEvent = happyWindow.ClipboardEvent;

// Animation frame — use setTimeout to simulate rAF in test env
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 16);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);
