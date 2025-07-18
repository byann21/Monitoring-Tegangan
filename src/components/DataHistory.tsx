import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, History, Calendar as CalendarIcon } from 'lucide-react';
import { format, isSameDay, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface WeldingRecord {
  id: string;
  timestamp: string; // ISO format string
  minVoltage: number;
  maxVoltage: number;
  avgVoltage: number;
  duration: string;
  operator: string;
}

interface DataHistoryProps {
  weldingRecords?: WeldingRecord[];
  isSystemOn: true;
  currentVoltage: number;
}

const DataHistory = ({ isSystemOn, currentVoltage }: DataHistoryProps) => {
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [realtimeData, setRealtimeData] = useState<WeldingRecord[]>([]);
  const [storedRecords, setStoredRecords] = useState<WeldingRecord[]>([]);
  const [currentSession, setCurrentSession] = useState<string | null>(null);

  const saveToServer = async (record: WeldingRecord) => {
    try {
      const response = await fetch('http://localhost:3001/api/voltage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'esp32-01',
          voltage: record.avgVoltage,
          minVoltage: record.minVoltage,
          maxVoltage: record.maxVoltage,
          avgVoltage: record.avgVoltage,
          timestamp: record.timestamp,
        }),
      });

      if (!response.ok) throw new Error('Gagal menyimpan data ke server');
      console.log('Data berhasil dikirim ke server');
    } catch (error) {
      console.error('Error saat menyimpan:', error);
    }
  };

  useEffect(() => {
    if (isSystemOn) {
      if (!currentSession) {
        const sessionId = `SESSION_${Date.now()}`;
        setCurrentSession(sessionId);
        console.log(`New welding session started: ${sessionId}`);
      }

      const interval = setInterval(() => {
        const newRecord: WeldingRecord = {
          id: `WLD_${Date.now()}`,
          timestamp: new Date().toISOString(),
          minVoltage: Math.max(0, currentVoltage - 2),
          maxVoltage: currentVoltage + 2,
          avgVoltage: currentVoltage,
          duration: '00:03',
          operator: 'Admin',
        };

        setRealtimeData(prev => [...prev, newRecord]);
        saveToServer(newRecord);
      }, 3000);

      return () => clearInterval(interval);
    } else {
      if (currentSession) {
        console.log(`Welding session ended: ${currentSession}`);
        setCurrentSession(null);
      }
    }
  }, [isSystemOn, currentVoltage, currentSession]);

  useEffect(() => {
    fetch('http://localhost:3001/api/voltage/latest?limit=100')
      .then(res => res.json())
      .then(data => {
        const formatted = data.map((item: any) => ({
          id: `DB_${item.id}`,
          timestamp: item.timestamp,
          minVoltage: item.min_voltage || 0,
          maxVoltage: item.max_voltage || 0,
          avgVoltage: item.avg_voltage || item.voltage || 0,
          duration: '00:03',
          operator: 'Admin'
        }));
        setStoredRecords(formatted);
      })
      .catch(err => console.error('Gagal fetch data dari DB:', err));
  }, []);

  const allRecords = [...storedRecords];

  const filteredRecords = allRecords.filter(record => {
    const recordDate = parseISO(record.timestamp);
    return isSameDay(recordDate, selectedDate);
  });

  const handleSelectAll = () => {
    if (selectedRecords.length === filteredRecords.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(filteredRecords.map(record => record.id));
    }
  };

  const handleSelectRecord = (id: string) => {
    setSelectedRecords(prev =>
      prev.includes(id)
        ? prev.filter(recordId => recordId !== id)
        : [...prev, id]
    );
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleDownload = () => {
    const selectedData = filteredRecords.filter(record =>
      selectedRecords.includes(record.id)
    );

    const csvContent = [
      ['ID', 'Timestamp', 'Min Voltage (V)', 'Max Voltage (V)', 'Avg Voltage (V)', 'Duration', 'Operator'],
      ...selectedData.map(record => [
        record.id,
        format(parseISO(record.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: id }),
        record.minVoltage.toString(),
        record.maxVoltage.toString(),
        record.avgVoltage.toString(),
        record.duration,
        record.operator
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `welding_data_${format(selectedDate, 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Date Filter Card */}
      <Card className="bg-white shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-blue-500" />
            Filter Tanggal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? (
                  format(selectedDate, "PPP", { locale: id })
                ) : (
                  <span>Pilih tanggal</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Tanggal dipilih:</span>
              <span className="font-medium">
                {format(selectedDate, "dd/MM/yyyy")}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total data:</span>
              <span className="font-medium">
                {filteredRecords.length} record
              </span>
            </div>
            <div className="flex justify-between">
              <span>Status sistem:</span>
              <span className={`font-medium ${isSystemOn ? 'text-green-600' : 'text-red-600'}`}>
                {isSystemOn ? 'Aktif (Logging...)' : 'Tidak Aktif'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data History Table */}
      <Card className="bg-white shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
              <History className="h-5 w-5 text-blue-500" />
              Riwayat Data Pengelasan
            </CardTitle>
            <Button
              onClick={handleDownload}
              disabled={selectedRecords.length === 0}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Data ({selectedRecords.length})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      type="checkbox"
                      checked={selectedRecords.length === filteredRecords.length && filteredRecords.length > 0}
                      onChange={handleSelectAll}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Min (V)</TableHead>
                  <TableHead>Max (V)</TableHead>
                  <TableHead>Rata-rata (V)</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Operator</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedRecords.includes(record.id)}
                        onChange={() => handleSelectRecord(record.id)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{record.id}</TableCell>
                    <TableCell>
                      {format(parseISO(record.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: id })}
                    </TableCell>
                    <TableCell>{record.minVoltage.toFixed(1)}</TableCell>
                    <TableCell>{record.maxVoltage.toFixed(1)}</TableCell>
                    <TableCell>{record.avgVoltage.toFixed(1)}</TableCell>
                    <TableCell>{record.duration}</TableCell>
                    <TableCell>{record.operator}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {filteredRecords.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              Tidak ada data pengelasan untuk tanggal {format(selectedDate, "dd/MM/yyyy")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DataHistory;
