import React, { useRef, useEffect, useState } from 'react';

function CameraView({ onTap, tapPoint, maskBox }) {
  const videoRef = useRef(null);
  const [cameraError, setCameraError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    let stream;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setCameraError(true);
      }
    };
    if (!previewUrl) startCamera();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [previewUrl]);

  const handleTap = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0].clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0].clientY);
    if (clientX == null) return;
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    onTap({ x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) });
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    onTap({ x: 0.5, y: 0.45, uploadedFile: file });
  };

  return (
    <div>
      <div className="camera-frame" onClick={handleTap}>
        {previewUrl ? (
          <img className="preview" src={previewUrl} alt="Uploaded exhibit" />
        ) : cameraError ? (
          <div className="camera-fallback">
            <p>Camera unavailable here. Upload an exhibit photo instead.</p>
            <label className="btn btn-primary" style={{ display: 'inline-block', marginTop: 8 }}>
              Upload photo
              <input type="file" accept="image/*" hidden onChange={handleFile} />
            </label>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted />
        )}
        {tapPoint && (
          <div
            className="tap-marker"
            style={{ left: `${tapPoint.x * 100}%`, top: `${tapPoint.y * 100}%` }}
          />
        )}
        {maskBox && (
          <div
            className="mask-box"
            style={{
              left: `${maskBox.x * 100}%`,
              top: `${maskBox.y * 100}%`,
              width: `${maskBox.width * 100}%`,
              height: `${maskBox.height * 100}%`
            }}
          />
        )}
        <div className="frame-caption">
          {tapPoint ? 'Artifact pinned — continue to Ask' : 'Tap the artifact you are looking at'}
        </div>
      </div>
    </div>
  );
}

export default CameraView;
