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

const diffSectors = (
  thisLapSectors: number[],
  comporableLapSectors: number[],
) => {
  return [
    thisLapSectors[0] === 0 || comporableLapSectors[0] === 0
      ? 0
      : thisLapSectors[0] - comporableLapSectors[0],
    thisLapSectors[1] === 0 || comporableLapSectors[1] === 0
      ? 0
      : thisLapSectors[1] - comporableLapSectors[1],
    thisLapSectors[2] === 0 || comporableLapSectors[2] === 0
      ? 0
      : thisLapSectors[2] - comporableLapSectors[2],
  ];
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
    if (sessionHistory != null && currentLapData != null) {
      // eslint-disable-next-line no-restricted-syntax, guard-for-in
      for (const key in sessionHistory) {
        const sessionHist = sessionHistory[key];
        if (sessionHist.m_carIdx === currentLapData.m_header.player_car_index) {
          return sessionHist;
        }
      }
    }
    return null;
  }, [sessionHistory, currentLapData]);

  const personalBestLap = useMemo(() => {
    if (personalSessionHistory == null) {
      return null;
    }
    const bestLapNumber = personalSessionHistory.m_bestLapTimeLapNum;
    const bestLapHistory =
      personalSessionHistory.m_lapHistoryData.length < bestLapNumber
        ? null
        : personalSessionHistory.m_lapHistoryData[bestLapNumber - 1];
    const bestLap = prevLapsData[bestLapNumber];

    return { bestLap, bestLapNumber, bestLapHistory };
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

  const { diff: diffToBestPersonalLap } = timesFromLapData(
    personalBestLap?.bestLap || null,
    selfLapData,
  );

  const lastLapSectorTimes = useMemo(() => {
    if (selfLapData == null || personalSessionHistory == null) {
      return [0, 0, 0];
    }
    const lastLapHistory =
      personalSessionHistory.m_lapHistoryData[selfLapData.m_currentLapNum - 2];
    if (lastLapHistory == null) {
      return [0, 0, 0];
    }
    return [
      lastLapHistory.m_sector1TimeInMS,
      lastLapHistory.m_sector2TimeInMS,
      lastLapHistory.m_sector3TimeInMS,
    ];
  }, [selfLapData, personalSessionHistory]);

  const bestPersonalLapSectorTimes =
    personalBestLap == null || personalBestLap.bestLapHistory == null
      ? [0, 0, 0]
      : [
          personalBestLap.bestLapHistory.m_sector1TimeInMS,
          personalBestLap.bestLapHistory.m_sector2TimeInMS,
          personalBestLap.bestLapHistory.m_sector3TimeInMS,
        ];

  // console.log(thisLapSectorTimes, lastLapSectorTimes);
  // console.log(thisLapSectorTimes, bestPersonalLapSectorTimes);

  const diffToLastLapSector = diffSectors(
    thisLapSectorTimes,
    lastLapSectorTimes,
  );

  // console.log(diffToLastLapSector);

  const diffToBestPersonalLapSector = diffSectors(
    thisLapSectorTimes,
    bestPersonalLapSectorTimes,
  );

  const shouldHide = differenceInSeconds(currentTime, lastUpdated) > 15;

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
        title="Diff to Personal Best Lap:"
        diff={diffToBestPersonalLap}
        sectorDiff={diffToBestPersonalLapSector}
      />

      <div className="flex flex-row justify-between">
        <div className="flex-grow">
          <span className="text-gray-400">Current Lap: </span>
          {msToText(currentLapTimeInMS)}
        </div>
        <div className="flex-grow">
          <span className="text-gray-400">Last Lap: </span>
          {msToText(lastLapTimeInMs)}
        </div>
      </div>
      <div className="flex flex-row justify-between">
        <div className="flex-grow">
          <span className="text-gray-400">Current sectors:</span>
          <div className="flex flex-row justify-between text-center">
            <div className="flex-grow">{msToText(thisLapSectorTimes[0])}, </div>
            <div className="flex-grow">{msToText(thisLapSectorTimes[1])}, </div>
            <div className="flex-grow">{msToText(thisLapSectorTimes[2])}</div>
          </div>
        </div>
        <div className="flex-grow">
          <span className="text-gray-400">Last sectors:</span>
          <div className="flex flex-row justify-between text-center">
            <div className="flex-grow">{msToText(lastLapSectorTimes[0])}, </div>
            <div className="flex-grow">{msToText(lastLapSectorTimes[1])}, </div>
            <div className="flex-grow">{msToText(lastLapSectorTimes[2])}</div>
          </div>
        </div>
      </div>
      <div className="mt-1">
        <div
          className={`flex flex-row justify-start ${getClassNameFromMs(
            diffToFront,
          )}`}
        >
          <span className="mr-1 text-gray-400">Front lap: </span>
          <div>
            {msToText(lastLapOfDriverInFront ?? 0)} ({msToText(diffToFront)})
          </div>
        </div>
        <div
          className={`flex flex-row justify-start ${getClassNameFromMs(
            diffToBehind,
          )}`}
        >
          <span className="mr-1 text-gray-400">Behind lap: </span>
          <div>
            {msToText(lastLapOfDriverBehind ?? 0)} ({msToText(diffToBehind)})
          </div>
        </div>
      </div>
      {/* <div>Last updated: {formatDistance(lastUpdated, new Date())}</div> */}
      <div className="flex flex-row justify-start mt-1">
        <div className="flex-grow">
          <span className="text-gray-400">Fuel remaining: </span>
          {roundToNearest(playerCarStatus?.m_fuel_remaining_laps ?? 0, 3)}
        </div>
        <div className="flex-grow">
          <span className="text-gray-400">Tyres: </span>
          {playerCarStatus?.m_tyres_age_laps}/{playerCurrentTyres?.m_lifeSpan}{' '}
          {playerCurrentTyres?.m_wear}%
        </div>
      </div>
      <div className="flex flex-row justify-between">
        <div className="flex-grow">
          <div>
            <span className="text-gray-400">Weather: </span>
            {session?.m_weather}
          </div>
          <div>
            <span className="text-gray-400">Track temp: </span>
            {session?.m_trackTemperature}
          </div>
          <div>
            <span className="text-gray-400">Air temp: </span>
            {session?.m_airTemperature}
          </div>
          <div>
            <span className="text-gray-400">Session Type: </span>
            {session?.m_sessionType}
          </div>
        </div>
        <div className="flex-grow">
          <div>
            <span className="text-gray-400">Time left: </span>
            {msToText(session?.m_sessionTimeLeft || 0, 's')}/
            {msToText(session?.m_sessionDuration || 0, 's')}
          </div>
          <div>
            <span className="text-gray-400">Pit Lap ideal: </span>
            {session?.m_pitStopWindowIdealLap}
          </div>
          <div>
            <span className="text-gray-400">Pit Lap latest: </span>
            {session?.m_pitStopWindowLatestLap}
          </div>
          <div>
            <span className="text-gray-400">Pit rejoin position: </span>
            {session?.m_pitStopRejoinPosition}
          </div>
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
