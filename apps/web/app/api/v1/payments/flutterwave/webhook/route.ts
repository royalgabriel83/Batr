import { receiveFlutterwaveEvent } from "@/server/payments/flutterwave";

/** Flutterwave payment notifications. Answers 503 until payments are configured. */
export const POST = (request: Request) => receiveFlutterwaveEvent(request);
