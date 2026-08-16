import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSIGNED_HANDLES,
  canClaimAssignedHandle,
  handleError,
  isPublicHandlePath,
  isReservedHandle,
  parseHandle,
  profileUrlForHandle,
  suggestHandle,
} from "./handles";

test("valid handles start with a letter and stay lowercase", () => {
  assert.equal(parseHandle("jai"), "jai");
  assert.equal(parseHandle("Jai"), "jai");
  assert.equal(parseHandle("jai-rathore"), "jai-rathore");
  assert.equal(parseHandle("ab"), null);
  assert.equal(parseHandle("1jai"), null);
  assert.equal(parseHandle("jai_rathore"), null);
});

test("product routes cannot be claimed as handles", () => {
  assert.equal(isReservedHandle("app"), true);
  assert.equal(isReservedHandle("docs"), true);
  assert.equal(isReservedHandle("setup"), true);
  assert.equal(parseHandle("app"), null);
  assert.equal(handleError("app"), "That handle is reserved by HoneyMatcha");
});

test("jai is assigned to the founder email and nobody else", () => {
  assert.equal(ASSIGNED_HANDLES.jai, "jaiadityarathore@gmail.com");
  assert.equal(
    canClaimAssignedHandle("jai", "jaiadityarathore@gmail.com"),
    true,
  );
  assert.equal(canClaimAssignedHandle("jai", "someone@example.com"), false);
  assert.equal(
    handleError("jai", "someone@example.com"),
    "That handle is already reserved",
  );
  assert.equal(handleError("jai", "jaiadityarathore@gmail.com"), null);
});

test("public handle paths skip reserved first-party routes", () => {
  assert.equal(isPublicHandlePath("/jai"), true);
  assert.equal(isPublicHandlePath("/app"), false);
  assert.equal(isPublicHandlePath("/app/settings"), false);
  assert.equal(isPublicHandlePath("/setup"), false);
  assert.equal(
    profileUrlForHandle("https://honeymatcha.io", "jai"),
    "https://honeymatcha.io/jai",
  );
});

test("suggested handles come from a name or email local part", () => {
  assert.equal(suggestHandle("Jai Rathore"), "jai-rathore");
  assert.equal(suggestHandle("jaiadityarathore@gmail.com"), "jaiadityarathore");
  assert.equal(suggestHandle("app@example.com"), "");
});
