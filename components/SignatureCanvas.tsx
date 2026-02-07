'use client';
import React, { useRef, useState, useEffect } from 'react';
import { Eraser } from 'lucide-react';

interface SignatureCanvasProps {
  onEnd: (dataUrl: string | null) => void;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({ onEnd }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0f172a'; // slate-900
    }
    
    // Handle resize
    const handleResize = () => {
        const prevContent = canvas.toDataURL();
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        const img = new Image();
        img.src = prevContent;
        img.onload = () => ctx?.drawImage(img, 0, 0);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
        onEnd(canvasRef.current.toDataURL());
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    if (!hasContent) setHasContent(true);
  };

  const beginPath = (e: React.MouseEvent | React.TouchEvent) => {
      setIsDrawing(true);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.beginPath();
      draw(e);
  }

  const clear = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasContent(false);
          onEnd(null);
      }
  }

  return (
    <div className="relative border-2 border-dashed border-slate-300 rounded-lg bg-white h-40 w-full touch-none">
       <canvas
         ref={canvasRef}
         className="w-full h-full cursor-crosshair"
         onMouseDown={beginPath}
         onMouseUp={stopDrawing}
         onMouseMove={draw}
         onMouseLeave={stopDrawing}
         onTouchStart={beginPath}
         onTouchEnd={stopDrawing}
         onTouchMove={draw}
       />
       {!hasContent && (
           <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-300">
               Sign Here
           </div>
       )}
       {hasContent && (
           <button onClick={clear} className="absolute top-2 right-2 p-1 bg-slate-100 text-slate-500 rounded hover:bg-slate-200" title="Clear Signature">
               <Eraser size={16}/>
           </button>
       )}
    </div>
  );
};
