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

import { notWS } from './constants.js';
import { TreeIterator, SHOW_ELEMENT_OR_TEXT } from './tree.js';
import { createElement, empty, detach, replaceWith } from './node.js';
import { isInline, isLeaf } from './range.js';
import { fixContainer } from './mergesplit.js';
import { isLineBreak } from './whitespace.js';


  

const styleToSemantic = {
    "font-weight": {
      regexp: /^bold|^700/i,
      replace() {
        return createElement("B");
      }
    },
    "font-style": {
      regexp: /^italic/i,
      replace() {
        return createElement("I");
      }
    },
    "font-family": {
      regexp: notWS,
      replace(classNames, family) {
        return createElement("SPAN", {
          class: classNames.fontFamily,
          style: "font-family:" + family
        });
      }
    },
    "font-size": {
      regexp: notWS,
      replace(classNames, size) {
        return createElement("SPAN", {
          class: classNames.fontSize,
          style: "font-size:" + size
        });
      }
    },
    "text-decoration": {
      regexp: /^underline/i,
      replace() {
        return createElement("U");
      }
    }
  };
  const fontSizes = {
    "1": "10",
    "2": "13",
    "3": "16",
    "4": "18",
    "5": "24",
    "6": "32",
    "7": "48"
  };

  const stylesRewriters = {
    STRONG: replaceWithTag("B"),
    EM: replaceWithTag("I"),
    INS: replaceWithTag("U"),
    STRIKE: replaceWithTag("S"),
    SPAN: replaceStyles,
    FONT: (node, parent, config) => {
      const font = node;
      const face = font.face;
      const size = font.size;
      let color = font.color;
      const classNames = config.classNames;
      let fontSpan;
      let sizeSpan;
      let colorSpan;
      let newTreeBottom;
      let newTreeTop;
      if (face) {
        fontSpan = createElement("SPAN", {
          class: classNames.fontFamily,
          style: "font-family:" + face
        });
        newTreeTop = fontSpan;
        newTreeBottom = fontSpan;
      }
      if (size) {
        sizeSpan = createElement("SPAN", {
          class: classNames.fontSize,
          style: "font-size:" + fontSizes[size] + "px"
        });
        if (!newTreeTop) {
          newTreeTop = sizeSpan;
        }
        if (newTreeBottom) {
          newTreeBottom.appendChild(sizeSpan);
        }
        newTreeBottom = sizeSpan;
      }
      if (color && /^#?([\dA-F]{3}){1,2}$/i.test(color)) {
        if (color.charAt(0) !== "#") {
          color = "#" + color;
        }
        colorSpan = createElement("SPAN", {
          class: classNames.color,
          style: "color:" + color
        });
        if (!newTreeTop) {
          newTreeTop = colorSpan;
        }
        if (newTreeBottom) {
          newTreeBottom.appendChild(colorSpan);
        }
        newTreeBottom = colorSpan;
      }
      if (!newTreeTop || !newTreeBottom) {
        newTreeTop = newTreeBottom = createElement("SPAN");
      }
      parent.replaceChild(newTreeTop, font);
      newTreeBottom.appendChild(empty(font));
      return newTreeBottom;
    },
    TT: (node, parent, config) => {
      const el = createElement("SPAN", {
        class: config.classNames.fontFamily,
        style: 'font-family:menlo,consolas,"courier new",monospace'
      });
      parent.replaceChild(el, node);
      el.appendChild(empty(node));
      return el;
    }
};
  
const allowedBlock = /^(?:A(?:DDRESS|RTICLE|SIDE|UDIO)|BLOCKQUOTE|CAPTION|D(?:[DLT]|IV)|F(?:IGURE|IGCAPTION|OOTER)|H[1-6]|HEADER|L(?:ABEL|EGEND|I)|O(?:L|UTPUT)|P(?:RE)?|SECTION|T(?:ABLE|BODY|D|FOOT|H|HEAD|R)|COL(?:GROUP)?|UL)$/;
const blacklist = /^(?:HEAD|META|STYLE)/;

export function cleanTree(node, config, preserveWS) {
    const children = node.childNodes;
    let nonInlineParent = node;
    while (isInline(nonInlineParent)) {
      nonInlineParent = nonInlineParent.parentNode;
    }
    const walker = new TreeIterator(
      nonInlineParent,
      SHOW_ELEMENT_OR_TEXT
    );
    for (let i = 0, l = children.length; i < l; i += 1) {
      let child = children[i];
      const nodeName = child.nodeName;
      const rewriter = stylesRewriters[nodeName];
      if (child instanceof HTMLElement) {
        const childLength = child.childNodes.length;
        if (rewriter) {
          child = rewriter(child, node, config);
        } else if (blacklist.test(nodeName)) {
          node.removeChild(child);
          i -= 1;
          l -= 1;
          continue;
        } else if (!allowedBlock.test(nodeName) && !isInline(child)) {
          i -= 1;
          l += childLength - 1;
          node.replaceChild(empty(child), child);
          continue;
        }
        if (childLength) {
          cleanTree(child, config, preserveWS || nodeName === "PRE");
        }
      } else {
        if (child instanceof Text) {
          let data = child.data;
          const startsWithWS = !notWS.test(data.charAt(0));
          const endsWithWS = !notWS.test(data.charAt(data.length - 1));
          if (preserveWS || !startsWithWS && !endsWithWS) {
            continue;
          }
          if (startsWithWS) {
            walker.currentNode = child;
            let sibling;
            while (sibling = walker.previousPONode()) {
              if (sibling.nodeName === "IMG" || sibling instanceof Text && notWS.test(sibling.data)) {
                break;
              }
              if (!isInline(sibling)) {
                sibling = null;
                break;
              }
            }
            data = data.replace(/^[ \t\r\n]+/g, sibling ? " " : "");
          }
          if (endsWithWS) {
            walker.currentNode = child;
            let sibling;
            while (sibling = walker.nextNode()) {
              if (sibling.nodeName === "IMG" || sibling instanceof Text && notWS.test(sibling.data)) {
                break;
              }
              if (!isInline(sibling)) {
                sibling = null;
                break;
              }
            }
            data = data.replace(/[ \t\r\n]+$/g, sibling ? " " : "");
          }
          if (data) {
            child.data = data;
            continue;
          }
        }
        node.removeChild(child);
        i -= 1;
        l -= 1;
      }
    }
    return node;
  };
 export function cleanupBRs (node, root, keepForBlankLine) {
    const brs = node.querySelectorAll("BR");
    const brBreaksLine = [];
    let l = brs.length;
    for (let i = 0; i < l; i += 1) {
      brBreaksLine[i] = isLineBreak(brs[i], keepForBlankLine);
    }
    while (l--) {
      const br = brs[l];
      const parent = br.parentNode;
      if (!parent) {
        continue;
      }
      if (!brBreaksLine[l]) {
        detach(br);
      } else if (!isInline(parent)) {
        fixContainer(parent, root);
      }
    }
  };  
export function escapeHTML(text) {
    return text.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split('"').join("&quot;");
  }; 
export function removeEmptyInlines(node) {
    const children = node.childNodes;
    let l = children.length;
    while (l--) {
      const child = children[l];
      if (child instanceof Element && !isLeaf(child)) {
        removeEmptyInlines(child);
        if (isInline(child) && !child.firstChild) {
          node.removeChild(child);
        }
      } else if (child instanceof Text && !child.data) {
        node.removeChild(child);
      }
    }
};  


function replaceStyles(node, _, config) {
    const style = node.style;
    let newTreeBottom;
    let newTreeTop;
    for (const attr in styleToSemantic) {
      const converter = styleToSemantic[attr];
      const css = style.getPropertyValue(attr);
      if (css && converter.regexp.test(css)) {
        const el = converter.replace(config.classNames, css);
        if (el.nodeName === node.nodeName && el.className === node.className) {
          continue;
        }
        if (!newTreeTop) {
          newTreeTop = el;
        }
        if (newTreeBottom) {
          newTreeBottom.appendChild(el);
        }
        newTreeBottom = el;
        node.style.removeProperty(attr);
      }
    }
    if (newTreeTop && newTreeBottom) {
      newTreeBottom.appendChild(empty(node));
      if (node.style.cssText) {
        node.appendChild(newTreeTop);
      } else {
        replaceWith(node, newTreeTop);
      }
    }
    return newTreeBottom || node;
  };
  function replaceWithTag(tag) {
    return (node, parent) => {
      const el = createElement(tag);
      const attributes = node.attributes;
      for (let i = 0, l = attributes.length; i < l; i += 1) {
        const attribute = attributes[i];
        el.setAttribute(attribute.name, attribute.value);
      }
      parent.replaceChild(el, node);
      el.appendChild(empty(node));
      return el;
    };
  };
  