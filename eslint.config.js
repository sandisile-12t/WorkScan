// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // The `firebase/*` umbrella subpaths (e.g. `firebase/auth`) have no
      // `exports` map and no `react-native` field, so Metro resolves them via
      // resolverMainFields ['react-native', 'browser', 'main'] to the *web*
      // build. That build omits React Native platform APIs such as
      // getReactNativePersistence, which fails at runtime with
      // "getReactNativePersistence is not a function" despite typechecking
      // cleanly. Always import the scoped @firebase/* packages instead.
      "no-restricted-imports": ["error", {
        paths: [
          { name: "firebase", message: "Import from '@firebase/app' instead; the umbrella package resolves to the web build on React Native." },
          { name: "firebase/app", message: "Import from '@firebase/app' instead; the umbrella package resolves to the web build on React Native." },
          { name: "firebase/auth", message: "Import from '@firebase/auth' instead; the umbrella package resolves to the web build on React Native." },
          { name: "firebase/firestore", message: "Import from '@firebase/firestore' instead; the umbrella package resolves to the web build on React Native." },
        ],
      }],
    },
  }
]);
