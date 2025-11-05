"use client";

import {
  Check,
  Clipboard,
  Edit3,
  FileBracesCorner,
  FileUp,
  Settings,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface SortingRule {
  id: string;
  name: string;
  description: string;
  fields: string[];
  enabled: boolean;
}

// Helper function to get nested value from object using dot notation path
function getNestedValue(obj: any, path: string): any {
  if (!path || !obj) return undefined;

  // Handle array notation like "slots[0]" or "data[0].id"
  const normalizedPath = path
    .replace(/\[(\d+)\]/g, ".$1") // Convert array[0] to array.0
    .replace(/^\./, ""); // Remove leading dot

  return normalizedPath.split(".").reduce((current, key) => {
    if (current === null || current === undefined) return undefined;

    // Handle numeric keys for array access
    if (/^\d+$/.test(key)) {
      const index = parseInt(key, 10);
      return Array.isArray(current) ? current[index] : undefined;
    }

    return current[key];
  }, obj);
}

// Check if an object has a value at the specified nested path
function hasNestedValue(obj: any, path: string): boolean {
  const value = getNestedValue(obj, path);
  return value !== undefined && value !== null;
}

// Extract array path and field paths from rule fields
function parseArrayRule(
  fields: string[]
): { arrayPath: string; fieldPaths: string[] } | null {
  // Look for patterns like "data[].field" or "items[].nested.field"
  const arrayPattern = /^([^[\]]+)\[\]\.(.+)$/;

  for (const field of fields) {
    const match = field.match(arrayPattern);
    if (match) {
      const [, arrayPath, fieldPath] = match;
      // All fields should target the same array
      const allFieldsMatchArray = fields.every((f) => {
        const fieldMatch = f.match(arrayPattern);
        return fieldMatch && fieldMatch[1] === arrayPath;
      });

      if (allFieldsMatchArray) {
        return {
          arrayPath,
          fieldPaths: fields.map((f) => f.match(arrayPattern)![2]),
        };
      }
    }
  }

  return null;
}

// Deep sort JSON objects recursively with custom sorting rules
function deepSortObject(obj: any, sortingRules: SortingRule[] = []): any {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    // First, recursively sort all elements in the array
    const sortedElements = obj.map((item) =>
      deepSortObject(item, sortingRules)
    );

    // Check if array contains objects and find matching sorting rule
    if (
      sortedElements.length > 0 &&
      sortedElements.every(
        (item) =>
          item !== null && typeof item === "object" && !Array.isArray(item)
      )
    ) {
      // Find the first enabled rule that matches this array
      const matchingRule = sortingRules.find((rule) => {
        if (!rule.enabled) return false;

        // Check if all objects have all required nested fields
        return sortedElements.every((item) =>
          rule.fields.every((field) => hasNestedValue(item, field))
        );
      });

      if (matchingRule) {
        // Sort by the specified fields in order of priority
        return sortedElements.sort((a, b) => {
          for (const field of matchingRule.fields) {
            const valueA = getNestedValue(a, field);
            const valueB = getNestedValue(b, field);

            // Skip if either value is undefined/null
            if (
              valueA === undefined ||
              valueA === null ||
              valueB === undefined ||
              valueB === null
            ) {
              continue;
            }

            // Handle different value types
            if (typeof valueA === "number" && typeof valueB === "number") {
              const result = valueA - valueB;
              if (result !== 0) return result;
            } else {
              const result = String(valueA).localeCompare(String(valueB));
              if (result !== 0) return result;
            }
          }
          return 0; // All fields are equal
        });
      }
    }

    // Return array with recursively sorted elements but preserve original order
    return sortedElements;
  }

  // Handle object - check for array sorting rules that target nested arrays
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: any = {};

  for (const key of sortedKeys) {
    let value = obj[key];

    // Check if this key matches any array sorting rules
    if (Array.isArray(value)) {
      // Look for rules that target this specific array path
      const matchingArrayRule = sortingRules.find((rule) => {
        if (!rule.enabled) return false;

        const arrayRule = parseArrayRule(rule.fields);
        return arrayRule && arrayRule.arrayPath === key;
      });

      if (matchingArrayRule) {
        const arrayRule = parseArrayRule(matchingArrayRule.fields);
        if (
          arrayRule &&
          value.length > 0 &&
          value.every(
            (item: any) =>
              item !== null && typeof item === "object" && !Array.isArray(item)
          )
        ) {
          // Check if all objects have the required fields
          const allHaveFields = value.every((item: any) =>
            arrayRule.fieldPaths.every((fieldPath: string) =>
              hasNestedValue(item, fieldPath)
            )
          );

          if (allHaveFields) {
            // Sort the array by the specified field paths
            value = [...value].sort((a, b) => {
              for (const fieldPath of arrayRule.fieldPaths) {
                const valueA = getNestedValue(a, fieldPath);
                const valueB = getNestedValue(b, fieldPath);

                // Skip if either value is undefined/null
                if (
                  valueA === undefined ||
                  valueA === null ||
                  valueB === undefined ||
                  valueB === null
                ) {
                  continue;
                }

                // Handle different value types
                if (typeof valueA === "number" && typeof valueB === "number") {
                  const result = valueA - valueB;
                  if (result !== 0) return result;
                } else {
                  const result = String(valueA).localeCompare(String(valueB));
                  if (result !== 0) return result;
                }
              }
              return 0; // All fields are equal
            });
          }
        }
      }
    }

    sortedObj[key] = deepSortObject(value, sortingRules);
  }

  return sortedObj;
}

// Generate diff between two JSON objects using LCS algorithm
function generateDiff(obj1: any, obj2: any): DiffLine[] {
  const str1 = JSON.stringify(obj1, null, 2);
  const str2 = JSON.stringify(obj2, null, 2);

  const lines1 = str1.split("\n");
  const lines2 = str2.split("\n");

  // Use a simple LCS-based diff algorithm
  const diff = computeDiff(lines1, lines2);
  return diff;
}

// Simple diff algorithm based on longest common subsequence
function computeDiff(lines1: string[], lines2: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  let i = 0,
    j = 0;

  while (i < lines1.length || j < lines2.length) {
    if (i >= lines1.length) {
      // Only lines2 remaining
      result.push({ type: "added", content: lines2[j], path: `line-${j}` });
      j++;
    } else if (j >= lines2.length) {
      // Only lines1 remaining
      result.push({ type: "removed", content: lines1[i], path: `line-${i}` });
      i++;
    } else if (lines1[i] === lines2[j]) {
      // Lines match
      result.push({ type: "equal", content: lines1[i], path: `line-${i}` });
      i++;
      j++;
    } else {
      // Lines differ - look ahead to find best match
      let found = false;

      // Look for line1[i] in upcoming lines2
      for (let k = j + 1; k < Math.min(j + 5, lines2.length); k++) {
        if (lines1[i] === lines2[k]) {
          // Found match - add intermediate lines2 as added
          for (let l = j; l < k; l++) {
            result.push({
              type: "added",
              content: lines2[l],
              path: `line-${l}`,
            });
          }
          result.push({ type: "equal", content: lines1[i], path: `line-${i}` });
          i++;
          j = k + 1;
          found = true;
          break;
        }
      }

      if (!found) {
        // Look for line2[j] in upcoming lines1
        for (let k = i + 1; k < Math.min(i + 5, lines1.length); k++) {
          if (lines2[j] === lines1[k]) {
            // Found match - add intermediate lines1 as removed
            for (let l = i; l < k; l++) {
              result.push({
                type: "removed",
                content: lines1[l],
                path: `line-${l}`,
              });
            }
            result.push({
              type: "equal",
              content: lines2[j],
              path: `line-${j}`,
            });
            i = k + 1;
            j++;
            found = true;
            break;
          }
        }
      }

      if (!found) {
        // No match found nearby - treat as different lines
        result.push({ type: "removed", content: lines1[i], path: `line-${i}` });
        result.push({ type: "added", content: lines2[j], path: `line-${j}` });
        i++;
        j++;
      }
    }
  }

  return result;
}

interface DiffLine {
  type: "added" | "removed" | "equal";
  content: string;
  path: string;
}

interface SideBySideDiff {
  left: Array<{
    content: string;
    type: "added" | "removed" | "equal" | "empty";
    lineNumber?: number;
  }>;
  right: Array<{
    content: string;
    type: "added" | "removed" | "equal" | "empty";
    lineNumber?: number;
  }>;
}

interface DiffChunk {
  type: "context" | "change";
  startLine: number;
  endLine: number;
  lines: Array<{
    left: {
      content: string;
      type: "added" | "removed" | "equal" | "empty";
      lineNumber?: number;
    };
    right: {
      content: string;
      type: "added" | "removed" | "equal" | "empty";
      lineNumber?: number;
    };
  }>;
  contextBefore?: number;
  contextAfter?: number;
  isExpanded?: boolean;
}

// Convert linear diff to side-by-side format
function generateSideBySideDiff(diff: DiffLine[]): SideBySideDiff {
  const left: SideBySideDiff["left"] = [];
  const right: SideBySideDiff["right"] = [];

  let leftLineNum = 1;
  let rightLineNum = 1;

  for (const line of diff) {
    switch (line.type) {
      case "equal":
        left.push({
          content: line.content,
          type: "equal",
          lineNumber: leftLineNum++,
        });
        right.push({
          content: line.content,
          type: "equal",
          lineNumber: rightLineNum++,
        });
        break;
      case "removed":
        left.push({
          content: line.content,
          type: "removed",
          lineNumber: leftLineNum++,
        });
        right.push({ content: "", type: "empty" });
        break;
      case "added":
        left.push({ content: "", type: "empty" });
        right.push({
          content: line.content,
          type: "added",
          lineNumber: rightLineNum++,
        });
        break;
    }
  }

  return { left, right };
}

// Create collapsible diff chunks (GitHub-style)
function createDiffChunks(
  sideBySideDiff: SideBySideDiff,
  contextLines: number = 3
): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  const totalLines = Math.max(
    sideBySideDiff.left.length,
    sideBySideDiff.right.length
  );

  // For small JSON objects (less than 20 lines), show everything expanded
  if (totalLines <= 20) {
    const lines = [];
    for (let j = 0; j < totalLines; j++) {
      lines.push({
        left: sideBySideDiff.left[j] || {
          content: "",
          type: "empty" as const,
        },
        right: sideBySideDiff.right[j] || {
          content: "",
          type: "empty" as const,
        },
      });
    }

    chunks.push({
      type: "change",
      startLine: 0,
      endLine: totalLines - 1,
      lines,
      contextBefore: 0,
      contextAfter: 0,
      isExpanded: true,
    });

    return chunks;
  }

  let i = 0;
  while (i < totalLines) {
    const leftLine = sideBySideDiff.left[i];
    const rightLine = sideBySideDiff.right[i];

    // Check if this line has changes
    const hasChanges =
      leftLine?.type !== "equal" || rightLine?.type !== "equal";

    if (hasChanges) {
      // Find the extent of the change block
      let changeStart = i;
      let changeEnd = i;

      // Extend backwards to include context
      const contextStart = Math.max(0, changeStart - contextLines);

      // Find end of change block
      while (changeEnd < totalLines - 1) {
        const nextLeft = sideBySideDiff.left[changeEnd + 1];
        const nextRight = sideBySideDiff.right[changeEnd + 1];
        const nextHasChanges =
          nextLeft?.type !== "equal" || nextRight?.type !== "equal";

        if (!nextHasChanges) {
          // Check if there are more changes within context distance
          let hasNearbyChanges = false;
          for (
            let j = changeEnd + 1;
            j < Math.min(totalLines, changeEnd + 1 + contextLines * 2);
            j++
          ) {
            const futureLeft = sideBySideDiff.left[j];
            const futureRight = sideBySideDiff.right[j];
            if (futureLeft?.type !== "equal" || futureRight?.type !== "equal") {
              hasNearbyChanges = true;
              break;
            }
          }
          if (!hasNearbyChanges) break;
        }
        changeEnd++;
      }

      // Extend forwards to include context
      const contextEnd = Math.min(totalLines - 1, changeEnd + contextLines);

      // Create change chunk
      const lines = [];
      for (let j = contextStart; j <= contextEnd; j++) {
        lines.push({
          left: sideBySideDiff.left[j] || {
            content: "",
            type: "empty" as const,
          },
          right: sideBySideDiff.right[j] || {
            content: "",
            type: "empty" as const,
          },
        });
      }

      chunks.push({
        type: "change",
        startLine: contextStart,
        endLine: contextEnd,
        lines,
        contextBefore: changeStart - contextStart,
        contextAfter: contextEnd - changeEnd,
        isExpanded: true,
      });

      i = contextEnd + 1;
    } else {
      // Find extent of unchanged block
      let unchangedStart = i;
      let unchangedEnd = i;

      while (unchangedEnd < totalLines - 1) {
        const nextLeft = sideBySideDiff.left[unchangedEnd + 1];
        const nextRight = sideBySideDiff.right[unchangedEnd + 1];
        if (nextLeft?.type !== "equal" || nextRight?.type !== "equal") break;
        unchangedEnd++;
      }

      // Only create context chunk if it's large enough to be worth collapsing
      if (unchangedEnd - unchangedStart > contextLines * 2) {
        const lines = [];
        for (let j = unchangedStart; j <= unchangedEnd; j++) {
          lines.push({
            left: sideBySideDiff.left[j] || {
              content: "",
              type: "empty" as const,
            },
            right: sideBySideDiff.right[j] || {
              content: "",
              type: "empty" as const,
            },
          });
        }

        chunks.push({
          type: "context",
          startLine: unchangedStart,
          endLine: unchangedEnd,
          lines,
          isExpanded: false,
        });
      } else {
        // Small unchanged block, include in previous or next change chunk
        // For now, just skip it (it will be included in adjacent change chunks)
      }

      i = unchangedEnd + 1;
    }
  }

  return chunks;
}

// Settings Modal Component
interface SettingsModalProps {
  sortingRules: SortingRule[];
  setSortingRules: React.Dispatch<React.SetStateAction<SortingRule[]>>;
  onClose: () => void;
}

function SettingsModal({
  sortingRules,
  setSortingRules,
  onClose,
}: SettingsModalProps) {
  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    fields: [""],
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Save sorting rules to localStorage whenever they change
  useEffect(() => {
    if (sortingRules.length > 0) {
      localStorage.setItem(
        "jsonDiffSortingRules",
        JSON.stringify(sortingRules)
      );
    }
  }, [sortingRules]);

  const addField = () => {
    setNewRule((prev) => ({
      ...prev,
      fields: [...prev.fields, ""],
    }));
  };

  const removeField = (index: number) => {
    setNewRule((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  };

  const updateField = (index: number, value: string) => {
    setNewRule((prev) => ({
      ...prev,
      fields: prev.fields.map((field, i) => (i === index ? value : field)),
    }));
  };

  const saveRule = () => {
    if (!newRule.name.trim()) return;

    const filteredFields = newRule.fields.filter(
      (field) => field.trim() !== ""
    );
    if (filteredFields.length === 0) return;

    const rule: SortingRule = {
      id: Date.now().toString(),
      name: newRule.name.trim(),
      description: newRule.description.trim(),
      fields: filteredFields,
      enabled: true,
    };

    setSortingRules((prev) => [...prev, rule]);
    setNewRule({ name: "", description: "", fields: [""] });
    setShowAddForm(false);
  };

  const toggleRule = (id: string) => {
    setSortingRules((prev) =>
      prev.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  };

  const deleteRule = (id: string) => {
    setSortingRules((prev) => prev.filter((rule) => rule.id !== id));
  };

  const moveRule = (id: string, direction: "up" | "down") => {
    setSortingRules((prev) => {
      const index = prev.findIndex((rule) => rule.id === id);
      if (index === -1) return prev;

      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newRules = [...prev];
      [newRules[index], newRules[newIndex]] = [
        newRules[newIndex],
        newRules[index],
      ];
      return newRules;
    });
  };

  const addExampleField = (path: string) => {
    setNewRule((prev) => ({
      ...prev,
      fields: [...prev.fields.filter((f) => f.trim() !== ""), path, ""],
    }));
  };

  const startEditingRule = (rule: SortingRule) => {
    setEditingRuleId(rule.id);
    setNewRule({
      name: rule.name,
      description: rule.description,
      fields: rule.fields,
    });
    setShowAddForm(true);
  };

  const updateRule = () => {
    if (!newRule.name.trim() || !editingRuleId) return;

    const filteredFields = newRule.fields.filter(
      (field) => field.trim() !== ""
    );
    if (filteredFields.length === 0) return;

    setSortingRules((prev) =>
      prev.map((rule) =>
        rule.id === editingRuleId
          ? {
              ...rule,
              name: newRule.name.trim(),
              description: newRule.description.trim(),
              fields: filteredFields,
            }
          : rule
      )
    );

    setNewRule({ name: "", description: "", fields: [""] });
    setShowAddForm(false);
    setEditingRuleId(null);
  };

  const cancelEdit = () => {
    setShowAddForm(false);
    setEditingRuleId(null);
    setNewRule({ name: "", description: "", fields: [""] });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Settings size={20} />
          <span className="font-semibold text-gray-900">Settings</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl font-bold"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Array Sorting Rules
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Configure how arrays of objects should be sorted during comparison
            using JSON path notation. Rules are applied in order of priority
            (top to bottom).
          </p>
        </div>

        {/* Existing Rules */}
        <div className="space-y-4 mb-6">
          {sortingRules.map((rule, index) => (
            <div
              key={rule.id}
              className={`border rounded-lg p-4 ${
                rule.enabled
                  ? "border-green-200 bg-green-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-500">
                      #{index + 1}
                    </span>
                    <h3 className="font-medium text-gray-900">{rule.name}</h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        rule.enabled
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  {rule.description && (
                    <p className="text-sm text-gray-600 mt-1">
                      {rule.description}
                    </p>
                  )}
                  <div className="mt-2">
                    <span className="text-sm text-gray-500">Sort by: </span>
                    <div className="mt-1 space-y-1">
                      {rule.fields.map((field, fieldIndex) => (
                        <div
                          key={fieldIndex}
                          className="text-sm font-mono bg-gray-100 px-2 py-1 rounded inline-block mr-2"
                        >
                          {fieldIndex + 1}. {field}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => moveRule(rule.id, "up")}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveRule(rule.id, "down")}
                    disabled={index === sortingRules.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => startEditingRule(rule)}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center gap-1"
                  >
                    <Edit3 size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={`px-3 py-1 text-sm rounded ${
                      rule.enabled
                        ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                        : "bg-green-100 text-green-800 hover:bg-green-200"
                    }`}
                  >
                    {rule.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="px-3 py-1 text-sm bg-red-100 text-red-800 rounded hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add New Rule */}
        {!showAddForm ? (
          <button
            onClick={() => {
              setShowAddForm(true);
              setEditingRuleId(null);
              setNewRule({ name: "", description: "", fields: [""] });
            }}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700"
          >
            + Add New Sorting Rule
          </button>
        ) : (
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="font-medium text-gray-900 mb-4">
              {editingRuleId ? "Edit Sorting Rule" : "Add New Sorting Rule"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) =>
                    setNewRule((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g., Resource Availability, API Response Data"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={newRule.description}
                  onChange={(e) =>
                    setNewRule((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Optional description of when this rule applies"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort Fields (JSON Paths in order of priority) *
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Use dot notation for nested fields. Use [] for arrays.
                  Examples below.
                </p>

                <div className="space-y-2">
                  {newRule.fields.map((field, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500 w-8">
                        #{index + 1}
                      </span>
                      <input
                        type="text"
                        value={field}
                        onChange={(e) => updateField(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
                        placeholder="e.g., relationships.resource.id or attributes.date"
                      />
                      {newRule.fields.length > 1 && (
                        <button
                          onClick={() => removeField(index)}
                          className="px-2 py-1 text-red-600 hover:text-red-800"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addField}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Add Another Field
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={cancelEdit}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={editingRuleId ? updateRule : saveRule}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
              >
                {editingRuleId ? "Update Rule" : "Save Rule"}
              </button>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">
            JSON Path Notation Guide
          </h3>
          <div className="text-sm text-blue-800 space-y-2">
            <div>
              <strong>Simple field:</strong>{" "}
              <code className="bg-blue-100 px-1 rounded">id</code> or{" "}
              <code className="bg-blue-100 px-1 rounded">name</code>
            </div>
            <div>
              <strong>Nested object:</strong>{" "}
              <code className="bg-blue-100 px-1 rounded">
                relationships.resource.id
              </code>
            </div>
            <div>
              <strong>Target array sorting:</strong>{" "}
              <code className="bg-blue-100 px-1 rounded">
                data[].relationships.resource.id
              </code>{" "}
              (sorts the 'data' array by resource.id)
            </div>
            <div>
              <strong>Array element access:</strong>{" "}
              <code className="bg-blue-100 px-1 rounded">
                data[].attributes.slots[0].start
              </code>{" "}
              (sorts 'data' array by first slot's start time)
            </div>
            <div>
              <strong>Deep nesting:</strong>{" "}
              <code className="bg-blue-100 px-1 rounded">
                data[].attributes.slots[0].relationships.appointmentType.data[0].id
              </code>
            </div>
          </div>
          <div className="mt-3 text-sm text-blue-800">
            <strong>How it works:</strong>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Rules are applied in order of priority (drag to reorder)</li>
              <li>For each array, the first matching rule is used</li>
              <li>
                Multiple fields create cascading sort (primary, secondary, etc.)
              </li>
              <li>
                Objects must have the specified nested values to match a rule
              </li>
              <li>If no rules match, arrays preserve their original order</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [leftJson, setLeftJson] = useState(`{
  "name": "Bulbasaur",
  "type": "Grass, Poison",
  "height_m": 0.7,
  "weight_kg": 6.9,
  "shape": "quadruped",
  "color": "green",
  "abilities": ["Overgrow", "Chlorophyll"],
  "evolutionStage": "Basic",
  "evolvesTo": "Ivysaur",
  "habitat": "grassland"
}`);
  const [rightJson, setRightJson] = useState(`{
  "name": "Ivysaur",
  "type": "Grass, Poison",
  "height_m": 1.0,
  "weight_kg": 13,
  "shape": "quadruped",
  "color": "green",
  "abilities": ["Overgrow", "Chlorophyll"],
  "evolutionStage": "Stage 1",
  "evolvesTo": "Venusaur",
  "habitat": "grassland"
}`);
  const [leftError, setLeftError] = useState("");
  const [rightError, setRightError] = useState("");
  const [diff, setDiff] = useState<DiffLine[]>([]);
  const [sideBySideDiff, setSideBySideDiff] = useState<SideBySideDiff | null>(
    null
  );
  const [showDiff, setShowDiff] = useState(false);
  const [sortingRules, setSortingRules] = useState<SortingRule[]>([]);
  const [diffChunks, setDiffChunks] = useState<DiffChunk[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [copiedSide, setCopiedSide] = useState<"left" | "right" | null>(null);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showSettingsModal) {
        setShowSettingsModal(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showSettingsModal]);

  // Load sorting rules from localStorage
  useEffect(() => {
    const savedRules = localStorage.getItem("jsonDiffSortingRules");
    if (savedRules) {
      setSortingRules(JSON.parse(savedRules));
    } else {
      // Default rules
      const defaultRules: SortingRule[] = [
        {
          id: "default-id",
          name: "ID Field",
          description: "Sort arrays of objects by id field",
          fields: ["id"],
          enabled: true,
        },
      ];
      setSortingRules(defaultRules);
      localStorage.setItem(
        "jsonDiffSortingRules",
        JSON.stringify(defaultRules)
      );
    }
  }, []);

  const validateAndParseJson = useCallback((jsonString: string) => {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error(
        `Invalid JSON: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }, []);

  const handleLeftJsonChange = useCallback(
    (value: string) => {
      setLeftJson(value);
      setLeftError("");

      try {
        validateAndParseJson(value);
      } catch (error) {
        if (value.trim() !== "") {
          setLeftError(error instanceof Error ? error.message : "Invalid JSON");
        }
      }
    },
    [validateAndParseJson]
  );

  const handleRightJsonChange = useCallback(
    (value: string) => {
      setRightJson(value);
      setRightError("");

      try {
        validateAndParseJson(value);
      } catch (error) {
        if (value.trim() !== "") {
          setRightError(
            error instanceof Error ? error.message : "Invalid JSON"
          );
        }
      }
    },
    [validateAndParseJson]
  );

  const handleCompare = useCallback(() => {
    try {
      const leftObj = validateAndParseJson(leftJson);
      const rightObj = validateAndParseJson(rightJson);

      const sortedLeft = deepSortObject(leftObj, sortingRules);
      const sortedRight = deepSortObject(rightObj, sortingRules);

      const diffResult = generateDiff(sortedLeft, sortedRight);
      const sideBySide = generateSideBySideDiff(diffResult);
      const chunks = createDiffChunks(sideBySide);

      setDiff(diffResult);
      setSideBySideDiff(sideBySide);
      setDiffChunks(chunks);
      setShowDiff(true);
    } catch (error) {
      console.error("Comparison failed:", error);
    }
  }, [leftJson, rightJson, validateAndParseJson, sortingRules]);

  const handleFileUpload = useCallback(
    (file: File, side: "left" | "right") => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (side === "left") {
          handleLeftJsonChange(content);
        } else {
          handleRightJsonChange(content);
        }
      };
      reader.readAsText(file);
    },
    [handleLeftJsonChange, handleRightJsonChange]
  );

  const toggleChunkExpansion = useCallback((chunkIndex: number) => {
    setDiffChunks((prev) =>
      prev.map((chunk, index) =>
        index === chunkIndex
          ? { ...chunk, isExpanded: !chunk.isExpanded }
          : chunk
      )
    );
  }, []);

  const expandAllChunks = useCallback(() => {
    setDiffChunks((prev) =>
      prev.map((chunk) => ({ ...chunk, isExpanded: true }))
    );
  }, []);

  const collapseAllChunks = useCallback(() => {
    setDiffChunks((prev) =>
      prev.map((chunk) => ({
        ...chunk,
        isExpanded: chunk.type === "change", // Keep change chunks expanded, collapse context
      }))
    );
  }, []);

  const copyToClipboard = useCallback(
    async (side: "left" | "right") => {
      try {
        const jsonString = side === "left" ? leftJson : rightJson;

        if (!jsonString.trim()) {
          return;
        }

        // Parse and sort the JSON
        const parsedJson = validateAndParseJson(jsonString);
        const sortedJson = deepSortObject(parsedJson, sortingRules);
        const formattedJson = JSON.stringify(sortedJson, null, 2);

        await navigator.clipboard.writeText(formattedJson);

        // Show success feedback with check icon
        setCopiedSide(side);
        setTimeout(() => {
          setCopiedSide(null);
        }, 1500);
      } catch (error) {
        alert(
          "Failed to copy: " +
            (error instanceof Error ? error.message : "Invalid JSON")
        );
      }
    },
    [leftJson, rightJson, validateAndParseJson, sortingRules]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left Section */}
          <div className="flex items-center space-x-4 flex-1">
            <div className="flex items-center space-x-2">
              <FileBracesCorner size={30} />
              <span className="font-semibold text-gray-900">
                Sorted JSON Diff
              </span>
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="text-md text-gray-600 hover:text-gray-800 flex items-center space-x-1"
            >
              <Settings size={20} />
              <span>Settings</span>
            </button>
          </div>

          {/* Center Section */}
          <div className="shrink-0">
            <button
              onClick={handleCompare}
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-md font-medium transition-colors"
              disabled={!!leftError || !!rightError}
            >
              Sort and diff
            </button>
          </div>

          {/* Right Section */}
          <div className="flex space-x-2 flex-1 justify-end">
            {showDiff && (
              <>
                <button
                  onClick={expandAllChunks}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAllChunks}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  Collapse All
                </button>
                <button
                  onClick={() => setShowDiff(false)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-medium transition-colors"
                >
                  Edit JSON
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Panel */}
        <div className="flex-1 flex flex-col border-r border-gray-200">
          <div className="bg-gray-100 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex gap-2">
              <h2 className="font-semibold text-gray-700">Original JSON</h2>
              <button
                onClick={() => copyToClipboard("left")}
                className={`hover:text-blue-800 flex items-center gap-1 ${
                  copiedSide === "left" ? "text-green-600" : ""
                }`}
                title="Copy sorted JSON to clipboard"
              >
                {copiedSide === "left" ? (
                  <Check size={16} />
                ) : (
                  <Clipboard size={16} />
                )}
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, "left");
                }}
                className="hidden"
                id="left-file-upload"
              />
              <label
                htmlFor="left-file-upload"
                className="text-sm text-gray-900 hover:text-gray-600 cursor-pointer flex items-center gap-1"
              >
                <FileUp size={16} />
                Open file
              </label>
            </div>
          </div>
          <div className="flex-1 p-4">
            {!showDiff ? (
              <>
                <textarea
                  value={leftJson}
                  onChange={(e) => handleLeftJsonChange(e.target.value)}
                  className={`w-full h-full resize-none border rounded-md p-3 font-mono text-sm ${
                    leftError ? "border-red-300 bg-red-50" : "border-gray-300"
                  }`}
                  placeholder="Paste your JSON here..."
                />
                {leftError && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                    {leftError}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full border rounded-md overflow-auto bg-white">
                <div className="font-mono text-sm">
                  {diffChunks.map((chunk, chunkIndex) => (
                    <div key={chunkIndex}>
                      {chunk.type === "context" && !chunk.isExpanded ? (
                        <div className="bg-gray-100 border-y border-gray-200 px-3 py-2 text-center">
                          <button
                            onClick={() => toggleChunkExpansion(chunkIndex)}
                            className="text-blue-600 hover:text-blue-800 text-sm flex items-center justify-center space-x-2 w-full"
                          >
                            <span>⋯</span>
                            <span>
                              Expand {chunk.lines.length} unchanged lines
                            </span>
                            <span>⋯</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          {chunk.type === "context" && chunk.isExpanded && (
                            <div className="bg-gray-100 border-y border-gray-200 px-3 py-1 text-center">
                              <button
                                onClick={() => toggleChunkExpansion(chunkIndex)}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                Collapse {chunk.lines.length} lines
                              </button>
                            </div>
                          )}
                          {chunk.lines.map((line, lineIndex) => (
                            <div
                              key={`${chunkIndex}-${lineIndex}`}
                              className={`flex px-3 py-1 ${
                                line.left.type === "removed"
                                  ? "bg-red-100 text-red-800"
                                  : line.left.type === "equal"
                                  ? "bg-white text-gray-700"
                                  : "bg-gray-50"
                              }`}
                            >
                              <span className="w-8 text-gray-400 text-right mr-3 select-none">
                                {line.left.lineNumber || ""}
                              </span>
                              <span className="w-4 text-center mr-2">
                                {line.left.type === "removed"
                                  ? "-"
                                  : line.left.type === "equal"
                                  ? " "
                                  : ""}
                              </span>
                              <span className="flex-1 whitespace-pre">
                                {line.left.content}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 flex flex-col">
          <div className="bg-gray-100 px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <div className="flex gap-2">
              <h2 className="font-semibold text-gray-700">Changed JSON</h2>
              <button
                onClick={() => copyToClipboard("right")}
                className={`hover:text-blue-800 flex items-center gap-1 ${
                  copiedSide === "right" ? "text-green-600" : ""
                }`}
                title="Copy sorted JSON to clipboard"
              >
                {copiedSide === "right" ? (
                  <Check size={16} />
                ) : (
                  <Clipboard size={16} />
                )}
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, "right");
                }}
                className="hidden"
                id="right-file-upload"
              />
              <label
                htmlFor="right-file-upload"
                className="text-sm text-gray-900 hover:text-gray-600 cursor-pointer flex items-center gap-1"
              >
                <FileUp size={16} />
                Open file
              </label>
            </div>
          </div>
          <div className="flex-1 p-4">
            {!showDiff ? (
              <>
                <textarea
                  value={rightJson}
                  onChange={(e) => handleRightJsonChange(e.target.value)}
                  className={`w-full h-full resize-none border rounded-md p-3 font-mono text-sm ${
                    rightError ? "border-red-300 bg-red-50" : "border-gray-300"
                  }`}
                  placeholder="Paste your JSON here..."
                />
                {rightError && (
                  <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                    {rightError}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full border rounded-md overflow-auto bg-white">
                <div className="font-mono text-sm">
                  {diffChunks.map((chunk, chunkIndex) => (
                    <div key={chunkIndex}>
                      {chunk.type === "context" && !chunk.isExpanded ? (
                        <div className="bg-gray-100 border-y border-gray-200 px-3 py-2 text-center">
                          <button
                            onClick={() => toggleChunkExpansion(chunkIndex)}
                            className="text-blue-600 hover:text-blue-800 text-sm flex items-center justify-center space-x-2 w-full"
                          >
                            <span>⋯</span>
                            <span>
                              Expand {chunk.lines.length} unchanged lines
                            </span>
                            <span>⋯</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          {chunk.type === "context" && chunk.isExpanded && (
                            <div className="bg-gray-100 border-y border-gray-200 px-3 py-1 text-center">
                              <button
                                onClick={() => toggleChunkExpansion(chunkIndex)}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                Collapse {chunk.lines.length} lines
                              </button>
                            </div>
                          )}
                          {chunk.lines.map((line, lineIndex) => (
                            <div
                              key={`${chunkIndex}-${lineIndex}`}
                              className={`flex px-3 py-1 ${
                                line.right.type === "added"
                                  ? "bg-green-100 text-green-800"
                                  : line.right.type === "equal"
                                  ? "bg-white text-gray-700"
                                  : "bg-gray-50"
                              }`}
                            >
                              <span className="w-8 text-gray-400 text-right mr-3 select-none">
                                {line.right.lineNumber || ""}
                              </span>
                              <span className="w-4 text-center mr-2">
                                {line.right.type === "added"
                                  ? "+"
                                  : line.right.type === "equal"
                                  ? " "
                                  : ""}
                              </span>
                              <span className="flex-1 whitespace-pre">
                                {line.right.content}
                              </span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettingsModal(false);
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <SettingsModal
              sortingRules={sortingRules}
              setSortingRules={setSortingRules}
              onClose={() => setShowSettingsModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
