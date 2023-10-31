import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import { useEffect, useMemo, useState } from 'react';
import type { PacketLapData, LapData } from 'f1-23-udp';

const msToText = (time: number) => {
  let s = time;
  const ms = s % 1000;
  s = (s - ms) / 1000;
  const secs = s % 60;
  s = (s - secs) / 60;
  const mins = s % 60;

  return `${mins}:${secs}.${ms}`;
  // return ms.toString();
  // const duration = intervalToDuration({ start: 0, end: ms });

  // const formatted = formatDuration(duration, {
  //   format: ['minutes', 'seconds', 'milliseconds'],
  //   // format: ["hours", "minutes", "seconds"],
  //   zero: true,
  //   delimiter: ':',
  // });

  // return formatted;
};

type PrevLapData = {
  distanceToLapTime: Record<number, number>;
  selfLapData: LapData;
};

function Hello() {
  const [prevLapsData, setPrevLapsData] = useState<Record<number, PrevLapData>>(
    {},
  );

  const [currentLapData, setCurrentLapData] = useState<PacketLapData | null>();

  useEffect(() => {
    console.log('Running use effect');
    const listener = window.electron.ipcRenderer.on(
      'lapData',
      (arg: unknown) => {
        // console.log(arg);
        const data = arg as PacketLapData;
        setCurrentLapData(data);
        // console.log(currentLapData);
        if (data != null) {
          const selfLapData = data.m_lapData[data.m_header.player_car_index];
          if (prevLapsData[selfLapData.m_currentLapNum] == null) {
            prevLapsData[selfLapData.m_currentLapNum] = {
              distanceToLapTime: {},
              selfLapData,
            };
          }
          if (selfLapData != null) {
            prevLapsData[selfLapData.m_currentLapNum].selfLapData = selfLapData;
            if (selfLapData.m_currentLapTimeInMS > 0) {
              prevLapsData[selfLapData.m_currentLapNum].distanceToLapTime[
                selfLapData.m_lapDistance
              ] = selfLapData.m_currentLapTimeInMS;
            }
          }
          setPrevLapsData(prevLapsData);
        }
      },
    );

    return () => {
      console.log('Destroying');
      listener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selfLapData: LapData | null = useMemo(() => {
    if (currentLapData == null) {
      return null;
    }
    return currentLapData.m_lapData[currentLapData.m_header.player_car_index];
  }, [currentLapData]);

  const lastLapTime = useMemo(() => {
    if (selfLapData == null) {
      return null;
    }
    // console.log(prevLapsData);
    if (prevLapsData[selfLapData.m_currentLapNum - 1]) {
      const prevLapData = prevLapsData[selfLapData.m_currentLapNum - 1];
      // console.log(prevLapData);
      let maxDistance = 0;
      let lapDistanceime: number | null = null;
      // eslint-disable-next-line no-restricted-syntax
      for (const d of Object.keys(prevLapData.distanceToLapTime)) {
        const currentDistance = parseFloat(d);
        if (
          selfLapData.m_lapDistance >= currentDistance &&
          currentDistance > maxDistance
        ) {
          maxDistance = currentDistance;
          lapDistanceime = prevLapData.distanceToLapTime[currentDistance];
        }
      }
      return lapDistanceime;
    }
    return null;
  }, [prevLapsData, selfLapData]);

  return (
    <div>
      <div>
        Current Lap:{' '}
        {selfLapData == null ? 0 : msToText(selfLapData.m_currentLapTimeInMS)}
      </div>
      <div>
        last lap Time: {lastLapTime == null ? 0 : msToText(lastLapTime)}
      </div>
      <div>
        Diff to last lap:{' '}
        {selfLapData == null || lastLapTime == null
          ? 0
          : msToText(selfLapData.m_currentLapTimeInMS - lastLapTime)}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
      </Routes>
    </Router>
  );
}
