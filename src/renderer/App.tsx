import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import 'tailwindcss/tailwind.css';
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
import { differenceInSeconds, subDays } from 'date-fns';
import { roundToNearest, msToText, getClassNameFromMs } from './helpers/util';
import DiffToLap from './components/diff';

type PrevLapData = {
  distanceToLapTime: Record<number, number>;
  selfLapData: LapData;
};

const timesFromLapData = (
  lapData: PrevLapData | null,
  selfLapData: LapData | null,
) => {
  if (lapData != null && selfLapData != null) {
    // console.log(prevLapData);
    let maxDistance = 0;
    let lapDistanceTime: number = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const d of Object.keys(lapData.distanceToLapTime)) {
      const currentDistance = parseFloat(d);
      if (
        selfLapData.m_lapDistance >= currentDistance &&
        currentDistance > maxDistance
      ) {
        maxDistance = currentDistance;
        lapDistanceTime = lapData.distanceToLapTime[currentDistance];
      }
    }
    return {
      lapDistanceTime,
      diff:
        lapDistanceTime == null
          ? 0
          : selfLapData.m_currentLapTimeInMS - lapDistanceTime,
    };
  }
  return {
    lapDistanceTime: 0,
    diff: 0,
  };
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

  const personalSessionHistory = useMemo(() => {
    if (sessionHistory != null) {
      // eslint-disable-next-line no-restricted-syntax, guard-for-in
      for (const key in sessionHistory) {
        const sessionHist = sessionHistory[key];
        if (sessionHist.m_header.player_car_index === sessionHist.m_carIdx) {
          return sessionHist;
        }
      }
    }
    return null;
  }, [sessionHistory]);

  const personalBestLap = useMemo(() => {
    if (personalSessionHistory == null) {
      return null;
    }
    const bestLapNumber = personalSessionHistory.m_bestLapTimeLapNum;
    const bestLap = prevLapsData[bestLapNumber];

    return { bestLap, bestLapNumber };
  }, [personalSessionHistory, prevLapsData]);

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

  const { diff: diffToLastLap } = timesFromLapData(prevLapData, selfLapData);

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

  const { diff: diffToBestLap } = timesFromLapData(
    personalBestLap?.bestLap || null,
    selfLapData,
  );

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

  const shouldHide =
    false && differenceInSeconds(currentTime, lastUpdated) > 15;

  return (
    <div
      className={`w-full h-full pointer-events-none transition-color duration-500 ${
        shouldHide ? 'bg-black/0 text-white/0' : 'bg-black/80 text-white'
      }`}
    >
      <DiffToLap
        title="Diff to Last Lap:"
        diff={diffToLastLap}
        sectorDiff={diffToLastLapSector}
      />
      <DiffToLap
        title="Diff to Best Lap:"
        diff={diffToBestLap}
        sectorDiff={undefined}
      />

      <div className="flex flex-row justify-between">
        <div className="flex-grow">
          Current Lap: {msToText(currentLapTimeInMS)}
        </div>
        <div className="flex-grow">Last Lap: {msToText(lastLapTimeInMs)}</div>
      </div>
      <div className="flex flex-row justify-between">
        <div className="flex-grow">
          Current sectors:
          <div className="flex flex-row justify-between text-center">
            <div className="flex-grow">{msToText(thisLapSectorTimes[0])}, </div>
            <div className="flex-grow">{msToText(thisLapSectorTimes[1])}, </div>
            <div className="flex-grow">{msToText(thisLapSectorTimes[2])}</div>
          </div>
        </div>
        <div className="flex-grow">
          Last sectors:
          <div className="flex flex-row justify-between text-center">
            <div className="flex-grow">{msToText(lastLapSectorTimes[0])}, </div>
            <div className="flex-grow">{msToText(lastLapSectorTimes[1])}, </div>
            <div className="flex-grow">{msToText(lastLapSectorTimes[2])}</div>
          </div>
        </div>
      </div>
      <div className="flex flex-row justify-between mt-1">
        <div className={`flex-grow ${getClassNameFromMs(diffToFront)}`}>
          Front lap: {msToText(lastLapOfDriverInFront ?? 0)} (
          {msToText(diffToFront)})
        </div>
        <div className={`flex-grow ${getClassNameFromMs(diffToBehind)}`}>
          Behind lap: {msToText(lastLapOfDriverBehind ?? 0)} (
          {msToText(diffToBehind)})
        </div>
      </div>
      {/* <div>Last updated: {formatDistance(lastUpdated, new Date())}</div> */}
      <div className="flex flex-row justify-start mt-1">
        <div className="flex-grow">
          Fuel remaining:{' '}
          {roundToNearest(playerCarStatus?.m_fuel_remaining_laps ?? 0, 3)}
        </div>
        <div className="flex-grow">
          Tyres: {playerCarStatus?.m_tyres_age_laps}/
          {playerCurrentTyres?.m_lifeSpan} {playerCurrentTyres?.m_wear}%
        </div>
      </div>
      <div className="flex flex-row justify-between">
        <div className="flex-grow">
          <div>Weather: {session?.m_weather}</div>
          <div>Track temp: {session?.m_trackTemperature}</div>
          <div>Air temp: {session?.m_airTemperature}</div>
          <div>Session Type: {session?.m_sessionType}</div>
        </div>
        <div className="flex-grow">
          <div>
            Time left: {msToText(session?.m_sessionTimeLeft || 0, 's')}/
            {msToText(session?.m_sessionDuration || 0, 's')}
          </div>
          <div>Pit Lap ideal: {session?.m_pitStopWindowIdealLap}</div>
          <div>Pit Lap latest: {session?.m_pitStopWindowLatestLap}</div>
          <div>Pit rejoin position: {session?.m_pitStopRejoinPosition}</div>
        </div>
      </div>
      <div className="flex flex-row justify-start">
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
