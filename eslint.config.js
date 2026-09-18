// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // React Native's built-in SafeAreaView is deprecated (SDK 57+).
      // Use SafeAreaView from 'react-native-safe-area-context' instead.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["SafeAreaView"],
              message: "Use SafeAreaView from 'react-native-safe-area-context' instead.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["dist/*"],
  }
]);
