import test from "node:test";
import assert from "node:assert/strict";

import { parseClassTeacherAssignment } from "../utils/classTeacherAssignment.js";

test("matches an unstreamed numeric grade across empty and placeholder stream values", () => {
  for (const stream of [null, "", "N/A", "NA", "Unassigned", "No stream"]) {
    assert.deepEqual(parseClassTeacherAssignment("Grade 8", stream), {
      grade: "8",
      stream: null
    });
  }
});

test("matches streamed grades when the stream is separate or embedded in the class label", () => {
  for (const [grade, stream] of [
    ["Grade 8", "A"],
    ["8", "Stream A"],
    ["Grade 8A", null],
    ["Grade 8 Stream A", null]
  ]) {
    assert.deepEqual(parseClassTeacherAssignment(grade, stream), {
      grade: "8",
      stream: "A"
    });
  }
});

test("supports unstreamed and streamed early-years class labels", () => {
  assert.deepEqual(parseClassTeacherAssignment("PP1", null), {
    grade: "PP1",
    stream: null
  });
  assert.deepEqual(parseClassTeacherAssignment("PG", "BLUE"), {
    grade: "PG",
    stream: "BLUE"
  });
});

test("rejects conflicting or invalid streams instead of selecting another class", () => {
  assert.equal(parseClassTeacherAssignment("Grade 8A", "B"), null);
  assert.equal(parseClassTeacherAssignment("Grade 8", "A1"), null);
});
