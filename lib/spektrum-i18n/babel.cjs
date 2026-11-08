/**
 * Localize statically authored UI copy at the rendering boundary.
 *
 * Story bodies, profiles, messages and other fetched/user-entered values are
 * deliberately not traversed or translated. Static option IDs stay unchanged:
 * only their rendered labels are localized. Each affected React component
 * subscribes to the existing locale context without remounting the screen.
 */
module.exports = function spektrumUiCopy({ types: t }) {
  const uiProps = new Set(["placeholder", "title", "alt", "aria-label", "accessibilityLabel", "label", "description", "helperText", "hint", "detail", "caption", "subtitle", "emptyText", "heading"]);
  function literalData(node) {
    if (!node) return false;
    if (t.isStringLiteral(node) || t.isNumericLiteral(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node)) return true;
    if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node) || t.isJSXElement(node)) return true;
    if (t.isConditionalExpression(node)) return literalData(node.consequent) && literalData(node.alternate);
    if (t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node)) return literalData(node.expression);
    if (t.isArrayExpression(node)) return node.elements.every(literalData);
    if (t.isObjectExpression(node)) return node.properties.every(p =>
      t.isObjectProperty(p) && !p.computed && (literalData(p.value) || (t.isIdentifier(p.value) && /^[A-Z]/.test(p.value.name))));
    return false;
  }

  function component(path) {
    for (let p = path.parentPath; p; p = p.parentPath) {
      if (!p.isFunction()) continue;
      const name = p.node.id?.name ?? (p.parentPath.isVariableDeclarator() ? p.parentPath.node.id.name : "");
      if (/^[A-Z]/.test(name) && t.isBlockStatement(p.node.body)) return p;
    }
    return null;
  }

  function copyScope(path, state) {
    const owner = component(path);
    if (!owner) return null;
    if (!state.copyHookImported) {
      // Register the import before Expo lowers destructuring and ES modules.
      // Adding it at Program.exit is too late: Babel can generate a local
      // `_useUiTranslation` temporary that shadows the unregistered hook.
      const [importPath] = state.copyProgram.unshiftContainer("body", t.importDeclaration([
        t.importSpecifier(t.cloneNode(state.copyHook), t.identifier("useUiTranslation")),
      ], t.stringLiteral("@/contexts/LocaleContext")));
      state.copyProgram.scope.registerDeclaration(importPath);
      state.copyHookImported = true;
    }
    let ids = state.copyOwners.get(owner.node);
    if (!ids) {
      ids = { text: owner.scope.generateUidIdentifier("uiText"), locale: owner.scope.generateUidIdentifier("uiLocale") };
      state.copyOwners.set(owner.node, ids);
      owner.get("body").unshiftContainer("body", t.variableDeclaration("const", [
        t.variableDeclarator(t.objectPattern([
          t.objectProperty(t.identifier("ui"), ids.text),
          t.objectProperty(t.identifier("locale"), ids.locale),
        ]), t.callExpression(t.cloneNode(state.copyHook), [])),
      ]));
    }
    state.copyUsed = true;
    return ids;
  }

  function localize(path, state) {
    if (path.node.__spektrumLocalized) return;
    const ids = copyScope(path, state);
    if (!ids) return;
    const original = path.node;
    original.__spektrumLocalized = true;
    path.replaceWith(t.callExpression(t.cloneNode(ids.text), [original]));
    path.skip();
  }

  function jsxText(value) {
    const lines = value.split(/\r\n|\n|\r/);
    let last = 0, result = "";
    lines.forEach((line, index) => { if (/[^ \t]/.test(line)) last = index; });
    lines.forEach((line, index) => {
      let part = line.replace(/\t/g, " ");
      if (index !== 0) part = part.replace(/^ +/, "");
      if (index !== lines.length - 1) part = part.replace(/ +$/, "");
      if (part) result += part + (index !== last ? " " : "");
    });
    return result;
  }

  // Only literal, application-owned option arrays/objects are eligible.
  // A value originating from props, state, an API, or Firestore is not static.
  function staticCopy(path, seen = new Set()) {
    if (!path?.node || seen.has(path.node)) return false;
    seen.add(path.node);
    if (literalData(path.node)) return true;
    if (path.isIdentifier()) {
      const binding = path.scope.getBinding(path.node.name);
      if (!binding) return false;
      if (binding.path.isVariableDeclarator()) return staticCopy(binding.path.get("init"), seen);
      const fn = binding.path.findParent(p => p.isFunction());
      if (fn?.parentPath.isCallExpression()) {
        const call = fn.parentPath;
        const callee = call.get("callee");
        if (callee.isMemberExpression() && callee.node.property.name === "map") return staticCopy(callee.get("object"), seen);
      }
      return false;
    }
    if (path.isMemberExpression()) return staticCopy(path.get("object"), seen);
    if (path.isTSAsExpression() || path.isTSSatisfiesExpression()) return staticCopy(path.get("expression"), seen);
    if (path.isCallExpression() && path.get("callee").isMemberExpression() &&
      ["filter", "slice"].includes(path.node.callee.property.name)) return staticCopy(path.get("callee.object"), seen);
    return false;
  }

  function rendered(path) {
    for (let p = path; p.parentPath; p = p.parentPath) {
      const parent = p.parentPath;
      if (parent.isJSXAttribute()) return false;
      // Function arguments include locale codes, enum IDs, and replacement
      // patterns, not just copy. Translate the displayed result explicitly.
      if (parent.isCallExpression() || parent.isNewExpression()) return false;
      if (parent.isBinaryExpression() && !["+", "??"].includes(parent.node.operator)) return false;
      if (parent.isConditionalExpression() && p.key === "test") return false;
      if (parent.isObjectProperty()) return false;
      if (parent.isJSXExpressionContainer()) {
        const attr = parent.parentPath;
        return !attr.isJSXAttribute() || uiProps.has(attr.node.name.name);
      }
      if (parent.isStatement() || parent.isFunction()) return false;
    }
    return false;
  }

  return {
    name: "spektrum-static-ui-copy",
    visitor: {
      Program: {
        enter(path, state) {
          state.copyEnabled = /[\\/](app|pages|components)[\\/].*\.tsx$/.test(state.filename ?? "")
            && !/[\\/]components[\\/]ui[\\/]/.test(state.filename ?? "");
          state.copyOwners = new WeakMap();
          state.copyHook = path.scope.generateUidIdentifier("useUiTranslation");
          state.copyProgram = path;
          state.copyHookImported = false;
        },
      },
      JSXText(path, state) {
        if (!state.copyEnabled) return;
        const value = jsxText(path.node.value);
        if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(value)) return;
        const ids = copyScope(path, state);
        if (!ids) return;
        path.replaceWith(t.jsxExpressionContainer(t.callExpression(t.cloneNode(ids.text), [t.stringLiteral(value)])));
        path.skip();
      },
      JSXAttribute(path, state) {
        if (!state.copyEnabled || !uiProps.has(path.node.name.name) || !t.isStringLiteral(path.node.value)) return;
        const ids = copyScope(path, state);
        if (!ids) return;
        path.node.value = t.jsxExpressionContainer(t.callExpression(t.cloneNode(ids.text), [path.node.value]));
        path.skip();
      },
      JSXExpressionContainer(path, state) {
        if (!state.copyEnabled) return;
        const expr = path.get("expression");
        // Static option data must be translated when displayed, not when stored.
        if ((expr.isIdentifier() || expr.isMemberExpression()) && rendered(expr) &&
          (staticCopy(expr) || (expr.isIdentifier() && /(^error$|Error$|^notice$)/.test(expr.node.name)) ||
            (expr.isMemberExpression() && expr.node.object.name === "notice" && expr.node.property.name === "text"))) localize(expr, state);
        if (expr.isCallExpression() && rendered(expr) && t.isIdentifier(expr.node.callee) &&
          /^(timeAgo|formatDuration|formatDate|getNotificationText)$/.test(expr.node.callee.name)) localize(expr, state);
      },
      StringLiteral(path, state) {
        if (!state.copyEnabled || path.node.__spektrumLocalized) return;
        if (rendered(path)) localize(path, state);
      },
      TemplateLiteral(path, state) {
        if (!state.copyEnabled) return;
        if (rendered(path) && path.node.quasis.some(q => /[çğıöşüÇĞİÖŞÜ]/.test(q.value.cooked ?? ""))) localize(path, state);
      },
      CallExpression(path, state) {
        if (!state.copyEnabled) return;
        const callee = path.get("callee");
        const name = callee.isIdentifier() ? callee.node.name : callee.isMemberExpression() ? callee.node.property.name : "";
        if (["toLocaleDateString", "toLocaleTimeString", "toLocaleString"].includes(name)) {
          const arg = path.get("arguments.0");
          if (arg?.isStringLiteral() && ["tr-TR", "tr"].includes(arg.node.value)) {
            const ids = copyScope(path, state);
            if (ids) arg.replaceWith(t.conditionalExpression(
              t.binaryExpression("===", t.cloneNode(ids.locale), t.stringLiteral("en")), t.stringLiteral("en-US"), t.stringLiteral("tr-TR"),
            ));
          }
        }
        if (name === "toast") {
          const config = path.get("arguments.0");
          if (config?.isObjectExpression()) for (const prop of config.get("properties")) {
            if (prop.isObjectProperty() && ["title", "description"].includes(prop.node.key.name)) localize(prop.get("value"), state);
          }
        }
        if (["share", "shareAsync"].includes(name)) {
          for (const config of path.get("arguments")) if (config.isObjectExpression()) {
            for (const prop of config.get("properties")) {
              if (!prop.isObjectProperty() || !["message", "text", "title", "dialogTitle"].includes(prop.node.key.name)) continue;
              const value = prop.get("value");
              if (value.isStringLiteral() || (value.isTemplateLiteral() && value.node.quasis.some(q => /[çğıöşüÇĞİÖŞÜ]/.test(q.value.cooked ?? "")))) localize(value, state);
            }
          }
        }
        if (["alert", "confirm", "prompt"].includes(name)) {
          const args = path.get("arguments");
          for (const arg of args.slice(0, name === "alert" && callee.isMemberExpression() ? 2 : 1)) {
            if (!arg.isSpreadElement()) localize(arg, state);
          }
          const buttons = args[2];
          if (buttons?.isArrayExpression()) for (const button of buttons.get("elements")) {
            if (button.isObjectExpression()) for (const prop of button.get("properties")) {
              if (prop.isObjectProperty() && prop.node.key.name === "text") localize(prop.get("value"), state);
            }
          }
        }
      },
    },
  };
};
