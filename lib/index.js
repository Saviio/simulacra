'use strict'

var processNodes = require('./process_nodes')
var bindKeys = require('./bind_keys')
var keyMap = require('./key_map')
var helpers = require('./helpers')
var rehydrate = require('./rehydrate')
var featureCheck = require('./feature_check')

var helper
var isArray = Array.isArray
var hasDefinitionKey = keyMap.hasDefinition
var replaceAttributeKey = keyMap.replaceAttribute
var isBoundToParentKey = keyMap.isBoundToParent
var isProcessedKey = keyMap.isProcessed

// Element tag names which should have value replaced.
var replaceValue = [ 'INPUT', 'TEXTAREA', 'PROGRESS' ]

// Input types which use the "checked" attribute.
var replaceChecked = [ 'checkbox', 'radio' ]

// Symbol for retaining an element instead of removing it.
Object.defineProperty(simulacra, 'retainElement', {
  enumerable: true, value: keyMap.retainElement
})

// Option to use comment nodes as markers.
Object.defineProperty(simulacra, 'useCommentNode', {
  get: function () { return processNodes.useCommentNode },
  set: function (value) { processNodes.useCommentNode = value },
  enumerable: true
})

// Assign helpers on the main export.
for (helper in helpers)
  simulacra[helper] = helpers[helper]


module.exports = simulacra


/**
 * Bind an object to the DOM.
 *
 * @param {Object} obj
 * @param {Object} def
 * @param {Node} [matchNode]
 * @return {Node}
 */
function simulacra (obj, def, matchNode) {
  var document = this ? this.document : window.document
  var Node = this ? this.Node : window.Node
  var node, query, path

  featureCheck(this || window)

  if (obj === null || typeof obj !== 'object' || isArray(obj))
    throw new TypeError('First argument must be a singular object.')

  if (!isArray(def))
    throw new TypeError('Second argument must be an array.')

  if (typeof def[0] === 'string') {
    query = def[0]
    def[0] = document.querySelector(query)
    if (!def[0]) throw new Error(
      'Top-level Node "' + query + '" could not be found in the document.')
  }
  else if (!(def[0] instanceof Node)) throw new TypeError(
    'The first position of the top-level must be either a Node or a CSS ' +
    'selector string.')

  if (!def[isProcessedKey]) {
    // Auto-detect template tag.
    if ('content' in def[0]) def[0] = def[0].content

    ensureNodes(this, def[0], def[1])
    setFrozen(def)
  }

  node = processNodes(this, def[0], def[1])

  path = []
  path.root = obj
  bindKeys(this, obj, def[1], node, path)

  if (matchNode) {
    rehydrate(this, obj, def[1], node, matchNode)
    return matchNode
  }

  return node
}


/**
 * Internal function to mutate string selectors into Nodes and validate that
 * they are allowed.
 *
 * @param {Object} [scope]
 * @param {Element} parentNode
 * @param {Object} def
 */
function ensureNodes (scope, parentNode, def) {
  var Element = scope ? scope.Element : window.Element
  var adjacentNodes = []
  var i, j, key, query, branch, boundNode, ancestorNode, matchedNodes

  if (typeof def !== 'object') throw new TypeError(
    'The second position must be an object.')

  for (key in def) {
    branch = def[key]

    // Change function or definition object bound to parent.
    if (typeof branch === 'function' || (typeof branch === 'object' &&
      branch !== null && !Array.isArray(branch)))
      def[key] = branch = [ parentNode, branch ]

    // Cast CSS selector string to array.
    else if (typeof branch === 'string') def[key] = branch = [ branch ]

    else if (!Array.isArray(branch))
      throw new TypeError('The binding on key "' + key + '" is invalid.')

    // Dereference CSS selector string to actual DOM element.
    if (typeof branch[0] === 'string') {
      query = branch[0]

      // May need to get the node above the parent, in case of binding to
      // the parent node.
      ancestorNode = parentNode.parentNode || parentNode

      // Match all nodes for the selector, pick the first and remove the rest.
      matchedNodes = ancestorNode.querySelectorAll(query)

      if (!matchedNodes.length) throw new Error(
        'An element for selector "' + query + '" was not found.')

      for (i = 1, j = matchedNodes.length; i < j; i++)
        matchedNodes[i].parentNode.removeChild(matchedNodes[i])

      branch[0] = matchedNodes[0]
    }
    else if (!(branch[0] instanceof Element))
      throw new TypeError('The first position on key "' + key +
        '" must be a DOM element or a CSS selector string.')

    // Auto-detect template tag.
    if ('content' in branch[0]) branch[0] = branch[0].content

    boundNode = branch[0]

    if (typeof branch[1] === 'object' && branch[1] !== null) {
      Object.defineProperty(branch, hasDefinitionKey, { value: true })
      if (branch[2] && typeof branch[2] !== 'function')
        throw new TypeError('The third position on key "' + key +
          '" must be a function.')
    }
    else if (branch[1] && typeof branch[1] !== 'function')
      throw new TypeError('The second position on key "' + key +
        '" must be an object or a function.')

    // Special case for binding to parent node.
    if (parentNode === boundNode) {
      Object.defineProperty(branch, isBoundToParentKey, { value: true })
      if (branch[hasDefinitionKey]) ensureNodes(scope, boundNode, branch[1])
      else if (typeof branch[1] === 'function')
        setReplaceAttribute(branch, boundNode)
      else console.warn( // eslint-disable-line
        'A change function was not defined on the key "' + key + '".')
      setFrozen(branch)
      continue
    }

    adjacentNodes.push([ key, boundNode ])

    if (!parentNode.contains(boundNode))
      throw new Error('The bound DOM element must be either ' +
        'contained in or equal to the element in its parent binding.')

    if (branch[hasDefinitionKey]) {
      ensureNodes(scope, boundNode, branch[1])
      setFrozen(branch)
      continue
    }

    setReplaceAttribute(branch, boundNode)
    setFrozen(branch)
  }

  // Need to loop again to invalidate containment in adjacent nodes, after the
  // adjacent nodes are found.
  for (key in def) {
    boundNode = def[key][0]
    for (i = 0, j = adjacentNodes.length; i < j; i++)
      if (adjacentNodes[i][1].contains(boundNode) &&
        adjacentNodes[i][1] !== boundNode)
        throw new Error(
          'The element for key "' + key + '" is contained in the ' +
          'element for the adjacent key "' + adjacentNodes[i][0] + '".')
  }

  // Freeze the definition.
  setFrozen(def)
}


function setReplaceAttribute (branch, boundNode) {
  Object.defineProperty(branch, replaceAttributeKey, {
    value: ~replaceValue.indexOf(boundNode.nodeName) ?
      ~replaceChecked.indexOf(boundNode.type) ?
      'checked' : 'value' : 'textContent'
  })
}


function setFrozen (obj) {
  Object.defineProperty(obj, isProcessedKey, { value: true })
  Object.freeze(obj)
}
