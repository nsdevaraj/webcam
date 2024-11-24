import CameraFeed from '@/components/camera-feed';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';

export default function Home() {
  return (
    <main className="h-screen">
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Camera className="h-8 w-8 text-primary" /> 
        </div>
      </div>
      
      <CameraFeed />
    </main>
  );
}