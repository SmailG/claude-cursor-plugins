#!/usr/bin/env node

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadJSON(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

const marketplaceSchema = loadJSON(
  resolve(root, "schemas/marketplace.schema.json")
);
const pluginSchema = loadJSON(resolve(root, "schemas/plugin.schema.json"));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validateMarketplace = ajv.compile(marketplaceSchema);
const validatePlugin = ajv.compile(pluginSchema);

let errors = 0;

function fail(message) {
  console.error(`ERROR: ${message}`);
  errors++;
}

// 1. Validate marketplace.json
const marketplacePath = resolve(root, ".cursor-plugin/marketplace.json");

if (!existsSync(marketplacePath)) {
  fail(".cursor-plugin/marketplace.json not found");
  process.exit(1);
}

const marketplace = loadJSON(marketplacePath);

if (!validateMarketplace(marketplace)) {
  fail("marketplace.json schema validation failed:");
  for (const err of validateMarketplace.errors) {
    console.error(`  ${err.instancePath || "/"}: ${err.message}`);
  }
}

// 2. Validate each plugin
for (const entry of marketplace.plugins ?? []) {
  const pluginDir = resolve(root, entry.source);
  const pluginJsonPath = resolve(pluginDir, ".cursor-plugin/plugin.json");

  // Check source directory exists
  if (!existsSync(pluginDir)) {
    fail(
      `Plugin "${entry.name}": source directory "${entry.source}" does not exist`
    );
    continue;
  }

  // Check plugin.json exists
  if (!existsSync(pluginJsonPath)) {
    fail(
      `Plugin "${entry.name}": missing .cursor-plugin/plugin.json in "${entry.source}"`
    );
    continue;
  }

  const pluginJson = loadJSON(pluginJsonPath);

  if (!validatePlugin(pluginJson)) {
    fail(
      `Plugin "${entry.name}": plugin.json schema validation failed (${entry.source}/.cursor-plugin/plugin.json):`
    );
    for (const err of validatePlugin.errors) {
      const detail =
        err.keyword === "additionalProperties"
          ? `${err.message}: "${err.params.additionalProperty}"`
          : err.message;
      console.error(`  ${err.instancePath || "/"}: ${detail}`);
    }
  }

  // Check that marketplace name matches plugin name
  if (pluginJson.name && pluginJson.name !== entry.name) {
    fail(
      `Plugin "${entry.name}": marketplace name does not match plugin.json name "${pluginJson.name}"`
    );
  }
}

// 3. Validate .claude-plugin/marketplace.json and per-plugin manifests
const claudeMarketplacePath = resolve(root, ".claude-plugin/marketplace.json");

if (!existsSync(claudeMarketplacePath)) {
  fail(".claude-plugin/marketplace.json not found");
} else {
  const cm = loadJSON(claudeMarketplacePath);

  if (!cm.name || typeof cm.name !== "string") {
    fail('.claude-plugin/marketplace.json: missing or invalid "name"');
  }
  if (!Array.isArray(cm.plugins)) {
    fail('.claude-plugin/marketplace.json: "plugins" must be an array');
  }

  for (const entry of cm.plugins ?? []) {
    const pluginDir = resolve(root, entry.source);
    const claudePluginJsonPath = resolve(pluginDir, ".claude-plugin/plugin.json");

    if (!existsSync(pluginDir)) {
      fail(
        `Claude plugin "${entry.name}": source directory "${entry.source}" does not exist`
      );
      continue;
    }

    if (!existsSync(claudePluginJsonPath)) {
      fail(
        `Claude plugin "${entry.name}": missing .claude-plugin/plugin.json in "${entry.source}"`
      );
      continue;
    }

    const p = loadJSON(claudePluginJsonPath);

    if (!p.name || typeof p.name !== "string") {
      fail(`Claude plugin "${entry.name}": plugin.json missing "name"`);
    }
    if (!p.description || typeof p.description !== "string") {
      fail(`Claude plugin "${entry.name}": plugin.json missing "description"`);
    }
    if (!p.author?.name) {
      fail(`Claude plugin "${entry.name}": plugin.json missing "author.name"`);
    }
    if (p.name && p.name !== entry.name) {
      fail(
        `Claude plugin "${entry.name}": plugin.json name "${p.name}" does not match marketplace entry`
      );
    }
  }
}

// 4. Report results
if (errors > 0) {
  console.error(`\nValidation failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log("All plugins validated successfully.");
  process.exit(0);
}
