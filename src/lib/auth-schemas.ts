import { z } from "zod";

/**
 * One definition of what a valid credential looks like, used on both sides.
 *
 * CLAUDE.md rule 8 asks for validation twice: on the client so the form can
 * guide someone as they type, and again in the handler because a browser is not
 * a trust boundary. Sharing the schema means the two cannot drift — a rule
 * relaxed for the form is relaxed for the server too, visibly, in one place.
 */

/** Case is not part of an address, and trailing spaces are always a mistake. */
const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .email("That email address is not valid.")
  .transform((v) => v.toLowerCase());

/**
 * Ten characters, per the design spec's fix to registration 2.12 — the drawing
 * asked for eight. Length does more for resistance to guessing than character
 * classes do, so this checks length and leaves composition to the user.
 */
export const MIN_PASSWORD_LENGTH = 10;

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  // Long enough to be a passphrase, short enough that scrypt stays cheap.
  .max(200, "That password is too long.");

const fullName = z
  .string()
  .trim()
  .min(2, "Enter your full name.")
  .max(120, "That name is too long.");

/** Self-service signup may only ever ask for these two. Admin is never granted. */
export const signupRoleSchema = z.enum(["pilot", "dispatcher"]);

export const signUpSchema = z
  .object({
    fullName,
    email,
    password,
    confirmPassword: z.string(),
    role: signupRoleSchema,
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const signInSchema = z.object({
  email,
  // Not length-checked: an old account may predate a rule change, and telling
  // someone their password is "too short" at sign-in leaks how it is stored.
  password: z.string().min(1, "Enter your password."),
});

export const verifyOtpSchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export const resendOtpSchema = z.object({ email });

export const requestPasswordResetSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    // Opaque to the client; the server decides whether it is still valid.
    token: z.string().min(1),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * First message from a failed parse, for forms that show one error at a time.
 * Returns null when the input is valid.
 */
export function firstError(result: z.SafeParseReturnType<unknown, unknown>): string | null {
  if (result.success) return null;
  return result.error.issues[0]?.message ?? "Check the details you entered.";
}
