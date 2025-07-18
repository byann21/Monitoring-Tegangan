
import { Card } from '@/components/ui/card';
import { Heart, Code, Zap } from 'lucide-react';

const Footer = () => {
  return (
    <Card className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 shadow-xl border-0 mt-8">
      <div className="px-8 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-sm">© 2025 SMAW Monitoring System</span>
            <span className="text-slate-500">|</span>
            <span className="text-sm">Dibuat Untuk</span>
            <Heart className="h-4 w-4 text-red-400" />
            <span className="text-sm">Laboratorium Teknik Mesin</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-slate-300">
              <Code className="h-4 w-4" />
              <span className="text-sm">Politeknik Purbaya</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Zap className="h-4 w-4" />
              <span className="text-sm">Monitoring Parameter Tegangan SMAW</span>
            </div>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <span>Powered by ESP32 Microcontroller & ZMPT101B Voltage Sensor</span>
            <span>Professional Welding Voltage Monitoring Solution</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default Footer;
