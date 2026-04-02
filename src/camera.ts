export async function startCamera(video: HTMLVideoElement): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
    });

    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    return new Promise((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = reject;
    }) 
}