import assert from "node:assert/strict";
import test from "node:test";
import { adminLoginErrorMessage } from "@/lib/admin-login-error";

test("shows the explanation returned by the login API", async () => {
  const response = Response.json(
    { error: "Incorrect password." },
    { status: 401 }
  );

  assert.equal(await adminLoginErrorMessage(response), "Incorrect password.");
});

test("explains non-JSON server failures", async () => {
  const response = new Response("Internal Server Error", {
    status: 500,
    headers: { "content-type": "text/html" }
  });

  assert.equal(
    await adminLoginErrorMessage(response),
    "Song Cards could not check the password (server error 500). Check the server logs and its ADMIN_PASSWORD and SESSION_SECRET settings."
  );
});

test("includes the status for unexplained login rejections", async () => {
  const response = new Response(null, { status: 403 });

  assert.equal(
    await adminLoginErrorMessage(response),
    "Unable to sign in (server response 403). Please try again."
  );
});
