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

import { isLeaf } from './range.js';


export function areAlike(node, node2) {
  if (isLeaf(node)) {
    return false;
  }
  if (node.nodeType !== node2.nodeType || node.nodeName !== node2.nodeName) {
    return false;
  }
  if (node instanceof HTMLElement && node2 instanceof HTMLElement) {
    return node.nodeName !== "A" && node.className === node2.className && node.style.cssText === node2.style.cssText;
  }
  return true;
};
export function createElement(tag, props, children) {
  const el = document.createElement(tag);
  if (props instanceof Array) {
    children = props;
    props = null;
  }
  if (props) {
    for (const attr in props) {
      const value = props[attr];
      if (value !== void 0) {
        el.setAttribute(attr, value);
      }
    }
  }
  if (children) {
    children.forEach((node) => el.appendChild(node));
  }
  return el;
};
export function detach(node) {
  const parent = node.parentNode;
  if (parent) {
    parent.removeChild(node);
  }
  return node;
};
export function empty(node) {
  const frag = document.createDocumentFragment();
  let child = node.firstChild;
  while (child) {
    frag.appendChild(child);
    child = node.firstChild;
  }
  return frag;
};

export function getLength(node) {
  return node instanceof Element || node instanceof DocumentFragment ? node.childNodes.length : node instanceof CharacterData ? node.length : 0;
};

export function getNearest(node, root, tag, attributes) {
  while (node && node !== root) {
    if (hasTagAttributes(node, tag, attributes)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
};
export function getNodeAfterOffset(node, offset) {
  let returnNode = node;
  if (returnNode instanceof Element) {
    const children = returnNode.childNodes;
    if (offset < children.length) {
      returnNode = children[offset];
    } else {
      while (returnNode && !returnNode.nextSibling) {
        returnNode = returnNode.parentNode;
      }
      if (returnNode) {
        returnNode = returnNode.nextSibling;
      }
    }
  }
  return returnNode;
};
export function getNodeBeforeOffset(node, offset) {
  let children = node.childNodes;
  while (offset && node instanceof Element) {
    node = children[offset - 1];
    children = node.childNodes;
    offset = children.length;
  }
  return node;
};
export function hasTagAttributes(node, tag, attributes) {
  if (node.nodeName !== tag) {
    return false;
  }
  for (const attr in attributes) {
    if (!("getAttribute" in node) || node.getAttribute(attr) !== attributes[attr]) {
      return false;
    }
  }
  return true;
};

export function replaceWith(node, node2) {
  const parent = node.parentNode;
  if (parent) {
    parent.replaceChild(node2, node);
  }
};