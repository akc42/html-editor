/**
@licence
    Copyright (c) 2024 Alan Chandler, all rights reserved

    This file is part of html-editor.

    html-editor is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    html-editor is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with html-editor.  If not, see <http://www.gnu.org/licenses/>.

    The software is derived from the npm squire-rte package at https://github.com/neilj/Squire
    which is licenced using the MIT Licence as follows:

    Copyright © 2011–2023 by Neil Jenkins

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to
    deal in the Software without restriction, including without limitation the
    rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
    sell copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
    IN THE SOFTWARE

*/

export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const DOCUMENT_FRAGMENT_NODE = 11;
export const ZWS = "\u200B";

export const ua = navigator.userAgent;
export const isMac = /Mac OS X/.test(ua);
export const isWin = /Windows NT/.test(ua);
export const isIOS = /iP(?:ad|hone|od)/.test(ua) || isMac && !!navigator.maxTouchPoints;
export const isAndroid = /Android/.test(ua);
export const isGecko = /Gecko\//.test(ua);
export const isLegacyEdge = /Edge\//.test(ua);
export const isWebKit = !isLegacyEdge && /WebKit\//.test(ua);
export const ctrlKey = isMac || isIOS ? "Meta-" : "Ctrl-";
export const cantFocusEmptyTextNodes = isWebKit;
export const supportsInputEvents = "onbeforeinput" in document && "inputType" in new InputEvent("input");


export const notWS = /[^ \t\r\n]/;

