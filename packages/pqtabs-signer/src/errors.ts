/** A signer failure with a stable machine code and a message that is safe to show a person. It never contains key material. */
export class SignerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SignerError";
    this.code = code;
  }
}
