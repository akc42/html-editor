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


import { isBlock, isContent, isEmptyBlock, isLeaf, isInline, getPreviousBlock, getNextBlock,requiredParents } from './block.js';
import { getLength, getNearest , getNodeBeforeOffset, getNodeAfterOffset } from './node.js';
import { ZWS, TEXT_NODE } from './constants.js';
import { fixCursor,isLineBreak } from './whitespace.js';
import { TreeIterator, SHOW_ELEMENT_OR_TEXT } from './tree.js';
import { split } from './mergesplit.js';


const START_TO_START = 0;
const START_TO_END = 1;
const END_TO_END = 2;
const END_TO_START = 3;



export function createRange(startContainer, startOffset, endContainer, endOffset) {
  const range = document.createRange();
  range.setStart(startContainer, startOffset);
  if (endContainer && typeof endOffset === "number") {
    range.setEnd(endContainer, endOffset);
  } else {
    range.setEnd(startContainer, startOffset);
  }
  return range;
};
export function deleteContentsOfRange(range, root) {
  const startBlock = getStartBlockOfRange(range, root);
  let endBlock = getEndBlockOfRange(range, root);
  const needsMerge = startBlock !== endBlock;
  if (startBlock && endBlock) {
    moveRangeBoundariesDownTree(range);
    moveRangeBoundariesUpTree(range, startBlock, endBlock, root);
  }
  const frag = extractContentsOfRange(range, null, root);
  moveRangeBoundariesDownTree(range);
  if (needsMerge) {
    endBlock = getEndBlockOfRange(range, root);
    if (startBlock && endBlock && startBlock !== endBlock) {
      mergeWithBlock(startBlock, endBlock, range, root);
    }
  }
  if (startBlock) {
    fixCursor(startBlock);
  }
  const child = root.firstChild;
  if (!child || child.nodeName === "BR") {
    fixCursor(root);
    if (root.firstChild) {
      range.selectNodeContents(root.firstChild);
    }
  }
  range.collapse(true);
  const startContainer = range.startContainer;
  const startOffset = range.startOffset;
  const iterator = new TreeIterator(root, SHOW_ELEMENT_OR_TEXT);
  let afterNode = startContainer;
  let afterOffset = startOffset;
  if (!(afterNode instanceof Text) || afterOffset === afterNode.data.length) {
    afterNode = getAdjacentInlineNode(iterator, "nextNode", afterNode);
    afterOffset = 0;
  }
  let beforeNode = startContainer;
  let beforeOffset = startOffset - 1;
  if (!(beforeNode instanceof Text) || beforeOffset === -1) {
    beforeNode = getAdjacentInlineNode(
      iterator,
      "previousPONode",
      afterNode || (startContainer instanceof Text ? startContainer : startContainer.childNodes[startOffset] || startContainer)
    );
    if (beforeNode instanceof Text) {
      beforeOffset = beforeNode.data.length;
    }
  }
  let node = null;
  let offset = 0;
  if (afterNode instanceof Text && afterNode.data.charAt(afterOffset) === " " && rangeDoesStartAtBlockBoundary(range, root)) {
    node = afterNode;
    offset = afterOffset;
  } else if (beforeNode instanceof Text && beforeNode.data.charAt(beforeOffset) === " ") {
    if (afterNode instanceof Text && afterNode.data.charAt(afterOffset) === " " || rangeDoesEndAtBlockBoundary(range, root)) {
      node = beforeNode;
      offset = beforeOffset;
    }
  }
  if (node) {
    node.replaceData(offset, 1, "\xA0");
  }
  range.setStart(startContainer, startOffset);
  range.collapse(true);
  return frag;
};


export function expandRangeToBlockBoundaries(range, root) {
    const start = getStartBlockOfRange(range, root);
    const end = getEndBlockOfRange(range, root);
    let parent;
    if (start && end) {
      parent = start.parentNode;
      range.setStart(parent, Array.from(parent.childNodes).indexOf(start));
      parent = end.parentNode;
      range.setEnd(parent, Array.from(parent.childNodes).indexOf(end) + 1);
    }
};
export function extractContentsOfRange(range, common, root) {
  const frag = document.createDocumentFragment();
  if (range.collapsed) {
    return frag;
  }
  if (!common) {
    common = range.commonAncestorContainer;
  }
  if (common instanceof Text) {
    common = common.parentNode;
  }
  const startContainer = range.startContainer;
  const startOffset = range.startOffset;
  let endContainer = split(range.endContainer, range.endOffset, common, root);
  let endOffset = 0;
  let node = split(startContainer, startOffset, common, root);
  while (node && node !== endContainer) {
    const next = node.nextSibling;
    frag.appendChild(node);
    node = next;
  }
  if (startContainer instanceof Text && endContainer instanceof Text) {
    startContainer.appendData(endContainer.data);
    detach(endContainer);
    endContainer = startContainer;
    endOffset = startOffset;
  }
  range.setStart(startContainer, startOffset);
  if (endContainer) {
    range.setEnd(endContainer, endOffset);
  } else {
    range.setEnd(common, common.childNodes.length);
  }
  fixCursor(common);
  return frag;
};
function getAdjacentInlineNode(iterator, method, node) {
  iterator.currentNode = node;
  let nextNode;
  while (nextNode = iterator[method]()) {
    if (nextNode instanceof Text || isLeaf(nextNode)) {
      return nextNode;
    }
    if (!isInline(nextNode)) {
      return null;
    }
  }
  return null;
};

export function getEndBlockOfRange(range, root) {
    const container = range.endContainer;
    let block;
    if (isInline(container)) {
      block = getNextBlock(container, root);
    } else if (container !== root && container instanceof HTMLElement && isBlock(container)) {
      block = container;
    } else {
      let node = getNodeAfterOffset(container, range.endOffset);
      if (!node || !root.contains(node)) {
        node = root;
        let child;
        while ((child = node.lastChild)) {
          node = child;
        }
      }
      block = getPreviousBlock(node, root);
    }
    return block && isNodeContainedInRange(range, block, true) ? block : null;
};

export function getStartBlockOfRange(range, root) {
    const container = range.startContainer;
    let block;
    if (isInline(container)) {
      block = getPreviousBlock(container, root);
    } else if (container !== root && container instanceof HTMLElement && isBlock(container)) {
      block = container;
    } else {
      const node = getNodeBeforeOffset(container, range.startOffset);
      block = getNextBlock(node, root);
    }
    return block && isNodeContainedInRange(range, block, true) ? block : null;
};
export function getTextContentsOfRange(range) {
  if (range.collapsed) {
    return "";
  }
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  const walker = new TreeIterator(
    range.commonAncestorContainer,
    SHOW_ELEMENT_OR_TEXT,
    (node2) => {
      return isNodeContainedInRange(range, node2, true);
    }
  );
  walker.currentNode = startContainer;
  let node = startContainer;
  let textContent = "";
  let addedTextInBlock = false;
  let value;
  if (!(node instanceof Element) && !(node instanceof Text) || !walker.filter(node)) {
    node = walker.nextNode();
  }
  while (node) {
    if (node instanceof Text) {
      value = node.data;
      if (value && /\S/.test(value)) {
        if (node === endContainer) {
          value = value.slice(0, range.endOffset);
        }
        if (node === startContainer) {
          value = value.slice(range.startOffset);
        }
        textContent += value;
        addedTextInBlock = true;
      }
    } else if (node.nodeName === "BR" || addedTextInBlock && !isInline(node)) {
      textContent += "\n";
      addedTextInBlock = false;
    }
    node = walker.nextNode();
  }
  textContent = textContent.replace(/ /g, " ");
  return textContent;
};
export function insertNodeInRange(range, node, root) {
  let { startContainer, startOffset } = range;
  let contentnode = node.lastChild? node.lastChild: node;

  if (!range.collapsed) {
    let done = true;
    try {
      range.surroundContents(contentnode);
    } catch(e) {
      done = false;
    }
    if (done) return;
    range.collapse();
  }
  let currentParent = startContainer === root? root:startContainer.parentNode;
  let parent = currentParent;
  const requiredNodes = requiredParents(node);
  if (requiredNodes) {
    while(!requiredNodes.includes(parent.nodeName)) {
      if (parent === root) return; //drop the whole thing as we cant find a suitable place to insert it
      parent = parent.parentNode;
    }  
  } else {
    while (isInline(parent)) {
      parent = parent.parentNode;
    }
    parent = (parent === root) ? root:parent.parentNode;
  }
  const frag = new DocumentFragment();
  let followingNode = null;
  if (startContainer instanceof Text) {
    followingNode = startContainer.splitText(startOffset);
    if (isInline(node)) {
      currentParent.insertBefore(node, followingNode);
    } else if (followingNode.data.length > 0) {
      frag.appendChild(followingNode);
    }
  }
  let foundchild = false;
  let foundParent = false;
  let sibling = false;
  while (!foundParent) {
    if (currentParent.parentNode === parent || currentParent === root) {
      foundParent = true;
      sibling = currentParent === parent ? null: currentParent.nextElementSibling;
    }
    if (followingNode?.data?.length??1 > 0) {
      const parentClone = currentParent.cloneNode(false);
      let children = [];
      if (currentParent !== root) {
        parentClone.appendChild(frag);
        frag.appendChild(parentClone);
        children = Array.from(currentParent.parentNode.childNodes);
      } else {
        children = Array.from(root.childNodes);
        currentParent === root.firstChild;
      }

      if (currentParent) {
        for(let i = 0; i < children.length; i++) {
          if (children[i] === currentParent) {
            foundchild = true;
          } else if (foundchild) {
            frag.appendChild(children[i]);
          }
        }
        currentParent = currentParent.parentNode
        foundchild = false;
      }
    } else if (!foundParent) {
      currentParent = currentParent.parentNode
    }
    followingNode = null;
  }
  parent.insertBefore(node, sibling);
  parent.insertBefore(frag, sibling);
  range.setStart(contentnode,0);
  range.setEnd(contentnode,0);
};
export function insertTreeFragmentIntoRange(range, frag, root) {
  const firstInFragIsInline = frag.firstChild && isInline(frag.firstChild);
  let node;
  fixContainer(frag);
  node = frag;
  while (node = getNextBlock(node, root)) {
    fixCursor(node);
  }
  if (!range.collapsed) {
    deleteContentsOfRange(range, root);
  }
  moveRangeBoundariesDownTree(range);
  range.collapse(false);
  const stopPoint = getNearest(range.endContainer, root, "BLOCKQUOTE") || root;
  let block = getStartBlockOfRange(range, root);
  let blockContentsAfterSplit = null;
  const firstBlockInFrag = getNextBlock(frag, frag);
  const replaceBlock = !firstInFragIsInline && !!block && isEmptyBlock(block);
  if (block && firstBlockInFrag && !replaceBlock && // Don't merge table cells or PRE elements into block
  !getNearest(firstBlockInFrag, frag, "PRE") && !getNearest(firstBlockInFrag, frag, "TABLE")) {
    moveRangeBoundariesUpTree(range, block, block, root);
    range.collapse(true);
    let container = range.endContainer;
    let offset = range.endOffset;
    this._cleanupBRs(block, this._config.keepLineBreaks);
    if (isInline(container)) {
      const nodeAfterSplit = split(
        container,
        offset,
        getPreviousBlock(container, root) || root,
        root
      );
      container = nodeAfterSplit.parentNode;
      offset = Array.from(container.childNodes).indexOf(
        nodeAfterSplit
      );
    }
    if (
      /*isBlock( container ) && */
      offset !== getLength(container)
    ) {
      blockContentsAfterSplit = document.createDocumentFragment();
      while (node = container.childNodes[offset]) {
        blockContentsAfterSplit.appendChild(node);
      }
    }
    mergeWithBlock(container, firstBlockInFrag, range, root);
    offset = Array.from(container.parentNode.childNodes).indexOf(
      container
    ) + 1;
    container = container.parentNode;
    range.setEnd(container, offset);
  }
  if (getLength(frag)) {
    if (replaceBlock && block) {
      range.setEndBefore(block);
      range.collapse(false);
      detach(block);
    }
    moveRangeBoundariesUpTree(range, stopPoint, stopPoint, root);
    let nodeAfterSplit = split(
      range.endContainer,
      range.endOffset,
      stopPoint,
      root
    );
    const nodeBeforeSplit = nodeAfterSplit ? nodeAfterSplit.previousSibling : stopPoint.lastChild;
    stopPoint.insertBefore(frag, nodeAfterSplit);
    if (nodeAfterSplit) {
      range.setEndBefore(nodeAfterSplit);
    } else {
      range.setEnd(stopPoint, getLength(stopPoint));
    }
    block = getEndBlockOfRange(range, root);
    moveRangeBoundariesDownTree(range);
    const container = range.endContainer;
    const offset = range.endOffset;
    if (nodeAfterSplit && isContainer(nodeAfterSplit)) {
      this._mergeContainers(nodeAfterSplit);
    }
    nodeAfterSplit = nodeBeforeSplit && nodeBeforeSplit.nextSibling;
    if (nodeAfterSplit && isContainer(nodeAfterSplit)) {
      this._mergeContainers(nodeAfterSplit);
    }
    range.setEnd(container, offset);
  }
  if (blockContentsAfterSplit && block) {
    const tempRange = range.cloneRange();
    fixCursor(blockContentsAfterSplit);
    mergeWithBlock(block, blockContentsAfterSplit, tempRange, root);
    range.setEnd(tempRange.endContainer, tempRange.endOffset);
  }
  moveRangeBoundariesDownTree(range);
}


export function isNodeContainedInRange(range, node, partial) {
  const nodeRange = document.createRange();
  nodeRange.setStart(node,0);
  nodeRange.setEnd(node,0);
  if (partial) {
    // Node must not finish before range starts or start after range
    // finishes.
    const nodeEndBeforeStart =
        range.compareBoundaryPoints(END_TO_START, nodeRange) > -1;
    const nodeStartAfterEnd =
        range.compareBoundaryPoints(START_TO_END, nodeRange) < 1;
    return !nodeEndBeforeStart && !nodeStartAfterEnd;
} else {
    // Node must start after range starts and finish before range
    // finishes
    const nodeStartAfterStart =
        range.compareBoundaryPoints(START_TO_START, nodeRange) < 1;
    const nodeEndBeforeEnd =
        range.compareBoundaryPoints(END_TO_END, nodeRange) > -1;
    return nodeStartAfterStart && nodeEndBeforeEnd;
}
};
export function moveRangeBoundariesDownTree(range) {
  let { startContainer, startOffset, endContainer, endOffset } = range;
  while (!(startContainer instanceof Text)) {
    let child = startContainer.childNodes[startOffset];
    if (!child || isLeaf(child)) {
      if (startOffset) {
        child = startContainer.childNodes[startOffset - 1];
        if (child instanceof Text) {
          let textChild = child;
          let prev;
          while (!textChild.length && (prev = textChild.previousSibling) && prev instanceof Text) {
            textChild.remove();
            textChild = prev;
          }
          startContainer = textChild;
          startOffset = textChild.data.length;
        }
      }
      break;
    }
    startContainer = child;
    startOffset = 0;
  }
  if (endOffset) {
    while (!(endContainer instanceof Text)) {
      const child = endContainer.childNodes[endOffset - 1];
      if (!child || isLeaf(child)) {
        if (child && child.nodeName === "BR" && !isLineBreak(child, false)) {
          endOffset -= 1;
          continue;
        }
        break;
      }
      endContainer = child;
      endOffset = getLength(endContainer);
    }
  } else {
    while (!(endContainer instanceof Text)) {
      const child = endContainer.firstChild;
      if (!child || isLeaf(child)) {
        break;
      }
      endContainer = child;
    }
  }
  range.setStart(startContainer, startOffset);
  range.setEnd(endContainer, endOffset);
};
export function moveRangeBoundariesUpTree(range, startMax, endMax, root) {
  let startContainer = range.startContainer;
  let startOffset = range.startOffset;
  let endContainer = range.endContainer;
  let endOffset = range.endOffset;
  let parent;
  if (!startMax) {
    startMax = range.commonAncestorContainer;
  }
  if (!endMax) {
    endMax = startMax;
  }
  while (!startOffset && startContainer !== startMax && startContainer !== root) {
    parent = startContainer.parentNode;
    startOffset = Array.from(parent.childNodes).indexOf(
      startContainer
    );
    startContainer = parent;
  }
  while (true) {
    if (endContainer === endMax || endContainer === root) {
      break;
    }
    if (endContainer.nodeType !== TEXT_NODE && endContainer.childNodes[endOffset] && endContainer.childNodes[endOffset].nodeName === "BR" && !isLineBreak(endContainer.childNodes[endOffset], false)) {
      endOffset += 1;
    }
    if (endOffset !== getLength(endContainer)) {
      break;
    }
    parent = endContainer.parentNode;
    endOffset = Array.from(parent.childNodes).indexOf(endContainer) + 1;
    endContainer = parent;
  }
  range.setStart(startContainer, startOffset);
  range.setEnd(endContainer, endOffset);
};
export function moveRangeBoundaryOutOf(range, tag, root) {
  let parent = getNearest(range.endContainer, root, tag);
  if (parent && (parent = parent.parentNode)) {
    const clone = range.cloneRange();
    moveRangeBoundariesUpTree(clone, parent, parent, root);
    if (clone.endContainer === parent) {
      range.setStart(clone.endContainer, clone.endOffset);
      range.setEnd(clone.endContainer, clone.endOffset);
    }
  }
  return range;
};

export function rangeDoesEndAtBlockBoundary(range, root) {
    const endContainer = range.endContainer;
    const endOffset = range.endOffset;
    let currentNode;
    if (endContainer instanceof Text) {
      const text = endContainer.data;
      const length = text.length;
      for (let i = endOffset; i < length; i += 1) {
        if (text.charAt(i) !== ZWS) {
          return false;
        }
      }
      currentNode = endContainer;
    } else {
      currentNode = getNodeBeforeOffset(endContainer, endOffset);
    }
    const block = getEndBlockOfRange(range, root);
    if (!block) {
      return false;
    }
    const contentWalker = new TreeIterator(
      block,
      SHOW_ELEMENT_OR_TEXT,
      isContent
    );
    contentWalker.currentNode = currentNode;
    return !contentWalker.nextNode();
};
export function rangeDoesStartAtBlockBoundary(range, root) {
    const startContainer = range.startContainer;
    const startOffset = range.startOffset;
    let nodeAfterCursor;
    if (startContainer instanceof Text) {
      const text = startContainer.data;
      for (let i = startOffset; i > 0; i -= 1) {
        if (text.charAt(i - 1) !== ZWS) {
          return false;
        }
      }
      nodeAfterCursor = startContainer;
    } else {
      nodeAfterCursor = getNodeAfterOffset(startContainer, startOffset);
      if (nodeAfterCursor && !root.contains(nodeAfterCursor)) {
        nodeAfterCursor = null;
      }
      if (!nodeAfterCursor) {
        nodeAfterCursor = getNodeBeforeOffset(startContainer, startOffset);
        if (nodeAfterCursor instanceof Text && nodeAfterCursor.length) {
          return false;
        }
      }
    }
    const block = getStartBlockOfRange(range, root);
    if (!block) {
      return false;
    }
    const contentWalker = new TreeIterator(
      block,
      SHOW_ELEMENT_OR_TEXT,
      isContent
    );
    contentWalker.currentNode = nodeAfterCursor;
    return !contentWalker.previousNode();
};
