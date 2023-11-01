import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PacketLapData,
  LapData,
  PacketParticipantsData,
  PacketSessionHistoryData,
  PacketEventData,
  PacketCarStatusData,
  PacketSessionData,
  PacketTyreSetsData,
} from 'f1-23-udp';
import { differenceInSeconds, formatDistance, subDays } from 'date-fns';

const padZeros = (num: number, pad: number) => {
  if (num >= 0) {
    return num.toString().padStart(pad, '0');
  }
  return `-${Math.abs(num).toString().padStart(pad, '0')}`;
};

function roundToNearest(num: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

const msToText = (time: number, inputFormat: 'ms' | 's' = 'ms') => {
  let text = '';
  let s = time;
  if (inputFormat === 's') {
    s *= 1000;
  }
  const ms = s % 1000;
  if (inputFormat === 'ms') {
    text = `.${padZeros(ms, 3)}${text}`;
  }
  s = (s - ms) / 1000;
  const secs = s % 60;
  if (Math.abs(s) > 0) {
    text = `${padZeros(secs, 2)}${text}`;
  }
  s = (s - secs) / 60;
  const mins = s;
  if (Math.abs(s) > 0) {
    text = `${padZeros(mins, 2)}:${text}`;
  }
  return text;
};
type PrevLapData = {
  distanceToLapTime: Record<number, number>;
  selfLapData: LapData;
};

function Main() {
  const [prevLapsData, setPrevLapsData] = useState<Record<number, PrevLapData>>(
    {},
  );

  const [currentLapData, setCurrentLapData] = useState<PacketLapData | null>();

  const [sessionHistory, setSessionHistory] = useState<
    Record<number, PacketSessionHistoryData>
  >({});

  const [participants, setParticipants] =
    useState<PacketParticipantsData | null>();

  const [session, setSession] = useState<PacketSessionData | null>();
  const [carStatus, setCarStatus] = useState<PacketCarStatusData | null>();

  const [tyreSets, setTyreSets] = useState<Record<number, PacketTyreSetsData>>(
    {},
  );

  const [lastUpdated, setLastUpdated] = useState<Date>(subDays(new Date(), 1));
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

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
          setParticipants(null);
          setSessionHistory({});
          setSession(null);
          setCarStatus(null);
          setTyreSets({});
        }
        setLastUpdated(new Date());
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

  useEffect(() => {
    const listener = window.electron.ipcRenderer.on('sessionHistory', (arg) => {
      const data = arg as PacketSessionHistoryData;
      sessionHistory[data.m_carIdx] = data;
      setSessionHistory(sessionHistory);
    });

    return () => {
      listener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const listener = window.electron.ipcRenderer.on('tyreSets', (arg) => {
      const data = arg as PacketTyreSetsData;
      tyreSets[data.m_carIdx] = data;
      setTyreSets(tyreSets);
    });

    return () => {
      listener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const listener = window.electron.ipcRenderer.on('participants', (data) => {
      setParticipants(data as PacketParticipantsData);
    });

    return () => {
      listener();
    };
  }, []);

  useEffect(() => {
    const listener = window.electron.ipcRenderer.on('session', (data) => {
      setSession(data as PacketSessionData);
    });

    return () => {
      listener();
    };
  }, []);

  useEffect(() => {
    const listener = window.electron.ipcRenderer.on('carStatus', (data) => {
      setCarStatus(data as PacketCarStatusData);
    });

    return () => {
      listener();
    };
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

  const lastLapOfDriver = useCallback(
    (driverPosition: number) => {
      if (currentLapData == null) {
        return 0;
      }
      let lapDataAtPosition: LapData | null = null;
      // eslint-disable-next-line no-restricted-syntax
      for (const driverLapData of currentLapData.m_lapData) {
        if (driverLapData.m_carPosition === driverPosition) {
          lapDataAtPosition = driverLapData;
        }
      }
      if (lapDataAtPosition == null) {
        return 0;
      }
      return lapDataAtPosition.m_lastLapTimeInMS;
    },
    [currentLapData],
  );

  const lastLapOfDriverInFront = useMemo(() => {
    if (selfLapData == null) {
      return 0;
    }
    return lastLapOfDriver(selfLapData.m_carPosition - 1);
  }, [lastLapOfDriver, selfLapData]);

  const lastLapOfDriverBehind = useMemo(() => {
    if (selfLapData == null) {
      return 0;
    }
    return lastLapOfDriver(selfLapData.m_carPosition + 1);
  }, [lastLapOfDriver, selfLapData]);

  const playerCarStatus = useMemo(() => {
    if (carStatus == null) {
      return null;
    }
    const carIndex = carStatus.m_header.player_car_index;
    return carStatus.m_car_status_data[carIndex];
  }, [carStatus]);

  const weatherForecast = useMemo(() => {
    const weatherChanges: { m_timeOffset: number; m_weather: number }[] = [];
    if (session == null) {
      return weatherChanges;
    }
    let currentWeather = session.m_weather;
    let i = 0;
    while (i < session.m_numWeatherForecastSamples) {
      const wForecast = session.m_weatherForecastSamples[i];
      if (wForecast.m_weather !== currentWeather) {
        currentWeather = wForecast.m_weather;
        weatherChanges.push({
          m_timeOffset: wForecast.m_timeOffset,
          m_weather: wForecast.m_weather,
        });
      }
      i += 1;
    }
    return weatherChanges;
  }, [session]);

  const playerCurrentTyres = useMemo(() => {
    if (currentLapData == null) {
      return null;
    }
    const playerTyreSets = tyreSets[currentLapData.m_header.player_car_index];
    if (playerTyreSets == null) {
      return null;
    }
    return playerTyreSets.m_tyreSetData[playerTyreSets.m_fittedIdx];
  }, [currentLapData, tyreSets]);

  const currentLapTimeInMS =
    selfLapData == null ? 0 : selfLapData.m_currentLapTimeInMS;

  const lastLapTimeInMs =
    selfLapData == null ? 0 : selfLapData.m_lastLapTimeInMS;

  const diffToFront =
    lastLapTimeInMs === 0 || lastLapOfDriverInFront === 0
      ? 0
      : lastLapTimeInMs - lastLapOfDriverInFront;
  const diffToBehind =
    lastLapTimeInMs === 0 || lastLapOfDriverBehind === 0
      ? 0
      : lastLapTimeInMs - lastLapOfDriverBehind;

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
          lastLapSectorTimes[0] !== 0 && selfLapData.m_sector <= 0
            ? 0
            : thisLapSectorTimes[0] - lastLapSectorTimes[0],

          lastLapSectorTimes[1] !== 0 && selfLapData.m_sector <= 1
            ? 0
            : thisLapSectorTimes[1] - lastLapSectorTimes[1],

          lastLapSectorTimes[2] !== 0 && selfLapData.m_sector <= 2
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

  if (differenceInSeconds(currentTime, lastUpdated) > 15) {
    return (
      <div
        style={{
          height: '100%',
          width: '90%',
          borderLeft: `1px solid rgba(7, 68, 232)`,
        }}
      />
    );
  }

  return (
    <div
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        height: '100%',
        width: '100%',
      }}
    >
      <div
        style={{
          marginBottom: '5px',
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              textAlign: 'center',
            }}
          >
            <div
              style={{ flexGrow: 1, ...getStyleFromMs(diffToLastLapSector[0]) }}
            >
              {msToText(diffToLastLapSector[0])},{' '}
            </div>
            <div
              style={{ flexGrow: 1, ...getStyleFromMs(diffToLastLapSector[1]) }}
            >
              {msToText(diffToLastLapSector[1])},{' '}
            </div>
            <div
              style={{ flexGrow: 1, ...getStyleFromMs(diffToLastLapSector[2]) }}
            >
              {msToText(diffToLastLapSector[2])}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flexGrow: 1 }}>
          Current Lap: {msToText(currentLapTimeInMS)}
        </div>
        <div style={{ flexGrow: 1 }}>Last Lap: {msToText(lastLapTimeInMs)}</div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flexGrow: 1 }}>
          Current sectors:
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              textAlign: 'center',
            }}
          >
            <div style={{ flexGrow: 1 }}>
              {msToText(thisLapSectorTimes[0])},{' '}
            </div>
            <div style={{ flexGrow: 1 }}>
              {msToText(thisLapSectorTimes[1])},{' '}
            </div>
            <div style={{ flexGrow: 1 }}>{msToText(thisLapSectorTimes[2])}</div>
          </div>
        </div>
        <div style={{ flexGrow: 1 }}>
          Last sectors:
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              textAlign: 'center',
            }}
          >
            <div style={{ flexGrow: 1 }}>
              {msToText(lastLapSectorTimes[0])},{' '}
            </div>
            <div style={{ flexGrow: 1 }}>
              {msToText(lastLapSectorTimes[1])},{' '}
            </div>
            <div style={{ flexGrow: 1 }}>{msToText(lastLapSectorTimes[2])}</div>
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          marginTop: '5px',
        }}
      >
        <div style={{ flexGrow: 1, ...getStyleFromMs(diffToFront) }}>
          Front lap: {msToText(lastLapOfDriverInFront ?? 0)} (
          {msToText(diffToFront)})
        </div>
        <div style={{ flexGrow: 1, ...getStyleFromMs(diffToBehind) }}>
          Behind lap: {msToText(lastLapOfDriverBehind ?? 0)} (
          {msToText(diffToBehind)})
        </div>
      </div>
      {/* <div>Last updated: {formatDistance(lastUpdated, new Date())}</div> */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-start',
          marginTop: '5px',
        }}
      >
        <div style={{ flexGrow: 1 }}>
          Fuel remaining:{' '}
          {roundToNearest(playerCarStatus?.m_fuel_remaining_laps ?? 0, 3)}
        </div>
        <div style={{ flexGrow: 1 }}>
          Tyres: {playerCarStatus?.m_tyres_age_laps}/
          {playerCurrentTyres?.m_lifeSpan} {playerCurrentTyres?.m_wear}%
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ flexGrow: 1 }}>
          <div>Weather: {session?.m_weather}</div>
          <div>Track temp: {session?.m_trackTemperature}</div>
          <div>Air temp: {session?.m_airTemperature}</div>
          <div>Session Type: {session?.m_sessionType}</div>
        </div>
        <div style={{ flexGrow: 1 }}>
          <div>
            Time left: {msToText(session?.m_sessionTimeLeft || 0, 's')}/
            {msToText(session?.m_sessionDuration || 0, 's')}
          </div>
          <div>Pit Lap ideal: {session?.m_pitStopWindowIdealLap}</div>
          <div>Pit Lap latest: {session?.m_pitStopWindowLatestLap}</div>
          <div>Pit rejoin position: {session?.m_pitStopRejoinPosition}</div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-start',
        }}
      >
        {weatherForecast.map((forecast) => (
          <div key={forecast.m_timeOffset}>
            {forecast.m_weather}:{forecast.m_timeOffset}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Main />} />
      </Routes>
    </Router>
  );
}
