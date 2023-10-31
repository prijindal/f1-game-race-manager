import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import { useEffect, useMemo, useState } from 'react';
import type { PacketLapData, LapData } from 'f1-23-udp';

const padZeros = (num: number, pad: number) => {
  return num.toString().padStart(pad, '0');
};

const msToText = (time: number) => {
  let s = time;
  const ms = s % 1000;
  s = (s - ms) / 1000;
  const secs = s % 60;
  s = (s - secs) / 60;
  const mins = s % 60;

  return `${padZeros(mins, 2)}:${padZeros(secs, 2)}.${padZeros(ms, 3)}`;
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
        if (
          currentLapData != null &&
          currentLapData.m_header.session_uid !== data.m_header.session_uid
        ) {
          setCurrentLapData(null);
          setPrevLapsData({});
        }
        setCurrentLapData(data);
        // console.log(currentLapData);
        if (data != null) {
          const localSelfLapData =
            data.m_lapData[data.m_header.player_car_index];
          if (prevLapsData[localSelfLapData.m_currentLapNum] == null) {
            prevLapsData[localSelfLapData.m_currentLapNum] = {
              distanceToLapTime: {},
              selfLapData: localSelfLapData,
            };
          }
          if (localSelfLapData != null) {
            prevLapsData[localSelfLapData.m_currentLapNum].selfLapData =
              localSelfLapData;
            if (localSelfLapData.m_currentLapTimeInMS > 0) {
              prevLapsData[localSelfLapData.m_currentLapNum].distanceToLapTime[
                localSelfLapData.m_lapDistance
              ] = localSelfLapData.m_currentLapTimeInMS;
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

  const prevLapData = useMemo(() => {
    if (selfLapData != null && prevLapsData[selfLapData.m_currentLapNum - 1]) {
      return prevLapsData[selfLapData.m_currentLapNum - 1];
    }
    return null;
  }, [prevLapsData, selfLapData]);

  const lastLapTime = useMemo(() => {
    if (prevLapData != null && selfLapData != null) {
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
  }, [prevLapData, selfLapData]);

  const currentLapTimeInMS =
    selfLapData == null ? 0 : selfLapData.m_currentLapTimeInMS;

  const lastLapTimeInMs =
    selfLapData == null ? 0 : selfLapData.m_lastLapTimeInMS;

  const diffToLastLap =
    selfLapData == null || lastLapTime == null
      ? 0
      : selfLapData.m_currentLapTimeInMS - lastLapTime;

  const thisLapSectorTimes =
    selfLapData == null
      ? [0, 0, 0]
      : [
          selfLapData.m_sector1TimeInMS,
          selfLapData.m_sector2TimeInMS,
          selfLapData.m_sector !== 3
            ? 0
            : selfLapData.m_currentLapTimeInMS -
              (selfLapData.m_sector1TimeInMS + selfLapData.m_sector2TimeInMS),
        ];

  const lastLapSectorTimes =
    selfLapData == null || prevLapData == null
      ? [0, 0, 0]
      : [
          prevLapData.selfLapData.m_sector1TimeInMS,
          prevLapData.selfLapData.m_sector2TimeInMS,
          selfLapData.m_lastLapTimeInMS -
            (prevLapData.selfLapData.m_sector1TimeInMS +
              prevLapData.selfLapData.m_sector2TimeInMS),
        ];

  const diffToLastLapSector =
    selfLapData == null
      ? [0, 0, 0]
      : [
          selfLapData.m_sector <= 0
            ? 0
            : thisLapSectorTimes[0] - lastLapSectorTimes[0],

          selfLapData.m_sector <= 1
            ? 0
            : thisLapSectorTimes[1] - lastLapSectorTimes[1],

          selfLapData.m_sector <= 2
            ? 0
            : thisLapSectorTimes[2] - lastLapSectorTimes[2],
        ];

  const getStyleFromMs = (ms: number) => {
    if (ms > 0) {
      return {
        backgroundColor: 'rgba(232, 7, 7, 0.6)',
      };
    }
    if (ms < 0) {
      return {
        backgroundColor: 'rgba(39, 245, 86, 0.6)',
      };
    }
    return {};
  };

  return (
    <div>
      <div
        style={{
          marginBottom: '20px',
          borderTop: `1px solid rgba(7, 68, 232)`,
          borderBottom: `1px solid rgba(7, 68, 232)`,
        }}
      >
        <div>Diff to Last Lap:</div>
        <div style={{ fontSize: '2rem', ...getStyleFromMs(diffToLastLap) }}>
          {msToText(diffToLastLap)}
        </div>
        <div>
          Sector Times:
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <div style={getStyleFromMs(diffToLastLapSector[0])}>
              {msToText(diffToLastLapSector[0])},{' '}
            </div>
            <div style={getStyleFromMs(diffToLastLapSector[1])}>
              {msToText(diffToLastLapSector[1])},{' '}
            </div>
            <div style={getStyleFromMs(diffToLastLapSector[2])}>
              {msToText(diffToLastLapSector[2])}
            </div>
          </div>
        </div>
      </div>

      <div>Current Lap: {msToText(currentLapTimeInMS)}</div>
      <div>Last Lap Time: {msToText(lastLapTimeInMs)}</div>
      <div style={{ marginTop: '20px' }}>
        <div>
          Current Lap sector times:
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <div>{msToText(thisLapSectorTimes[0])}, </div>
            <div>{msToText(thisLapSectorTimes[1])}, </div>
            <div>{msToText(thisLapSectorTimes[2])}</div>
          </div>
        </div>
        <div>
          Last Lap sector times:
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            <div>{msToText(lastLapSectorTimes[0])}, </div>
            <div>{msToText(lastLapSectorTimes[1])}, </div>
            <div>{msToText(lastLapSectorTimes[2])}</div>
          </div>
        </div>
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
