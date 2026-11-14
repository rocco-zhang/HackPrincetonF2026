import { INPUT } from "../config";
import { state } from "../state";

export const video = () => document.getElementById("cam") as HTMLVideoElement;

let stream: MediaStream | null = null;
let currentDeviceId: string | undefined;

export class CameraError extends Error {}

export async function startCamera(deviceId?: string) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError("This browser can't access a camera (needs https or localhost).");
  }
  stopCamera();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: INPUT.videoWidth },
        height: { ideal: INPUT.videoHeight },
        frameRate: { ideal: 30 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" }),
      },
    });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError")
      throw new CameraError("Camera permission was denied. You can still play with the mouse.");
    if (name === "NotFoundError" || name === "OverconstrainedError")
      throw new CameraError("No camera found. You can still play with the mouse.");
    throw new CameraError(`Couldn't start the camera (${name ?? err}). You can still play with the mouse.`);
  }
  currentDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId;
  const v = video();
  v.srcObject = stream;
  await v.play();
  state.cameraOn = true;
  applyMirror();
}

export function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  state.cameraOn = false;
}

/** Switch to the next camera (laptop ↔ external webcam). Returns its label. */
export async function nextCamera(): Promise<string> {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  if (cams.length < 2) return cams[0]?.label || "only one camera";
  const i = cams.findIndex((c) => c.deviceId === currentDeviceId);
  const next = cams[(i + 1) % cams.length];
  await startCamera(next.deviceId);
  return next.label || "camera";
}

export function applyMirror() {
  video().classList.toggle("mirrored", state.mirror);
}
