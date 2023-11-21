import 'tailwindcss/tailwind.css';
import './App.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  PacketLapData,
  LapData,
  PacketSessionHistoryData,
  PacketCarStatusData,
  PacketSessionData,
  PacketTyreSetsData,
  LapHistoryData,
  PacketParticipantsData,
} from 'f1-23-udp';
import { differenceInSeconds, subDays } from 'date-fns';
import { io } from 'socket.io-client';
import {
  roundToNearest,
  msToText,
  getClassNameFromMs,
  PrevLapData,
  timesFromLapData,
} from './helpers/util';
import DiffToLap from './components/diff';
import type { Channels } from '../main/preload';

const weatherToText = {
  0: 'clear',
  1: 'light cloud',
  2: 'overcast',
  3: 'light rain',
  4: 'heavy rain',
  5: 'storm',
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

type PrevLapsData = { [k: string]: PrevLapData };

const getIpcRenderer = () => {
  if (window.electron != null) {
    return window.electron.ipcRenderer;
  }
  const socket = io('ws://localhost:8080');
  return {
    sendMessage: () => {},
    on: (channel: Channels, func: (...args: unknown[]) => void) => {
      const listener = socket.on(channel, func);
      return () => {
        listener.removeListener();
      };
    },
  };
};

const ipcRenderer = getIpcRenderer();

export default function Main() {
  // {driver_index: PrevLapsData}
  const [prevLapsDriverData, setPrevLapsDriverData] = useState<{
    [k: string]: PrevLapsData;
  }>({});

  const [currentLapData, setCurrentLapData] = useState<PacketLapData | null>();

  const [sessionHistory, setSessionHistory] = useState<{
    [k: string]: PacketSessionHistoryData;
  }>({});

  const [participants, setParticipants] =
    useState<PacketParticipantsData | null>();

  const [session, setSession] = useState<PacketSessionData | null>();
  const [carStatus, setCarStatus] = useState<PacketCarStatusData | null>();

  const [tyreSets, setTyreSets] = useState<{ [k: string]: PacketTyreSetsData }>(
    {},
  );

  const [lastUpdated, setLastUpdated] = useState<Date>(subDays(new Date(), 1));
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const listener = ipcRenderer.on('start-instance', (arg: unknown) => {
      console.log(arg);
    });

    return () => {
      listener();
    };
  }, []);

  useEffect(() => {
    const listener = ipcRenderer.on('lapData', (arg: unknown) => {
      // console.log(arg);
      const data = arg as PacketLapData;
      if (
        currentLapData != null &&
        currentLapData.m_header.session_uid !== data.m_header.session_uid
      ) {
        setCurrentLapData(null);
        setPrevLapsDriverData({});
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
        for (let i = 0; i < data.m_lapData.length; i += 1) {
          const localSelfLapData = data.m_lapData[i];
          const prevLapsData = prevLapsDriverData[i.toString()] || {};
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
          prevLapsDriverData[i.toString()] = prevLapsData;
        }
        setPrevLapsDriverData(prevLapsDriverData);
        // console.log(`State set for ${localSelfLapData.m_lapDistance}`);
      }
    });

    return () => {
      listener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevLapsData: PrevLapsData = useMemo(() => {
    if (currentLapData != null) {
      return prevLapsDriverData[currentLapData.m_header.player_car_index];
    }
    return {};
  }, [prevLapsDriverData, currentLapData]);

  useEffect(() => {
    const listener = ipcRenderer.on('sessionHistory', (arg) => {
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
    const listener = ipcRenderer.on('tyreSets', (arg) => {
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
    const listener = ipcRenderer.on('participants', (data) => {
      setParticipants(data as PacketParticipantsData);
    });

    return () => {
      listener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const listener = ipcRenderer.on('session', (data) => {
      setSession(data as PacketSessionData);
    });

    return () => {
      listener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const listener = ipcRenderer.on('carStatus', (data) => {
      setCarStatus(data as PacketCarStatusData);
    });

    return () => {
      listener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useEffect(() => {
  //   const listener = ipcRenderer.on('event', (data) => {
  //     const event = data as PacketEventData;
  //     if (event != null && event.m_eventStringCode === 'FLBK') {
  //       const details = event.m_eventDetails as FlashbackData;
  //       console.log(event.m_header, details);
  //     }
  //   });

  //   return () => {
  //     listener();
  //   };
  // }, []);

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

  const overallBestLap = useMemo(() => {
    if (sessionHistory != null && currentLapData != null) {
      let fastestLapInMs = Number.MAX_SAFE_INTEGER;
      let fastestLapPlayerKey = 0;
      // eslint-disable-next-line no-restricted-syntax, guard-for-in
      for (const key in sessionHistory) {
        const sessionHist = sessionHistory[key];
        if (sessionHist != null) {
          const bestLapNumber = sessionHist.m_bestLapTimeLapNum;
          const bestLapHistory =
            sessionHist.m_lapHistoryData.length < bestLapNumber
              ? null
              : sessionHist.m_lapHistoryData[bestLapNumber - 1];
          if (
            bestLapHistory != null &&
            bestLapHistory.m_lapTimeInMS < fastestLapInMs
          ) {
            fastestLapInMs = bestLapHistory.m_lapTimeInMS;
            fastestLapPlayerKey = parseInt(key, 10);
          }
        }
      }

      const sessionHist = sessionHistory[fastestLapPlayerKey];
      if (sessionHist == null) {
        return null;
      }
      const bestLapNumber = sessionHist.m_bestLapTimeLapNum;
      const bestLapHistory =
        sessionHist.m_lapHistoryData.length < bestLapNumber
          ? null
          : sessionHist.m_lapHistoryData[bestLapNumber - 1];
      let bestLap: PrevLapData | undefined;
      const driverPrevLapData =
        prevLapsDriverData[fastestLapPlayerKey.toString()];
      if (driverPrevLapData) {
        bestLap = driverPrevLapData[bestLapNumber];
      }
      return { bestLapNumber, bestLap, bestLapHistory };
    }
    return null;
  }, [currentLapData, prevLapsDriverData, sessionHistory]);

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
      if (
        wForecast.m_weather !== currentWeather &&
        session.m_sessionType === wForecast.m_sessionType
      ) {
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

  const nearestTyreLap = useMemo(() => {
    if (playerCurrentTyres != null && currentLapData != null) {
      let nearestIndex = currentLapData.m_header.player_car_index;
      let tyreWearDiff = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < Object.keys(tyreSets).length; i += 1) {
        const tyreSet = tyreSets[i];
        if (tyreSet) {
          const fittedTyres = tyreSet.m_tyreSetData[tyreSet.m_fittedIdx];
          if (
            fittedTyres.m_actualTyreCompound ===
              playerCurrentTyres.m_actualTyreCompound &&
            i !== currentLapData.m_header.player_car_index
          ) {
            if (
              Math.abs(fittedTyres.m_wear - playerCurrentTyres.m_wear) <
              tyreWearDiff
            ) {
              nearestIndex = i;
              tyreWearDiff = Math.abs(
                fittedTyres.m_wear - playerCurrentTyres.m_wear,
              );
            }
          }
        }
      }
      if (
        currentLapData.m_lapData.length > nearestIndex &&
        sessionHistory[nearestIndex] != null &&
        prevLapsDriverData[nearestIndex] != null
      ) {
        const bestLapNumber =
          currentLapData.m_lapData[nearestIndex].m_currentLapNum;
        const bestLapHistory: LapHistoryData | undefined =
          sessionHistory[nearestIndex].m_lapHistoryData[bestLapNumber - 1];
        const bestLap: PrevLapData | undefined =
          prevLapsDriverData[nearestIndex][bestLapNumber];
        const driver =
          participants != null &&
          participants.m_participants.length > nearestIndex
            ? participants.m_participants[nearestIndex - 1]
            : null;
        // console.log(participants, nearestIndex);
        // console.log({ driver, bestLap, bestLapNumber, bestLapHistory });
        return { driver, bestLap, bestLapNumber, bestLapHistory };
      }
    }
    return null;
  }, [
    currentLapData,
    participants,
    playerCurrentTyres,
    prevLapsDriverData,
    sessionHistory,
    tyreSets,
  ]);

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

  const { diff: diffToLastLap } = useMemo(
    () => timesFromLapData(prevLapData, selfLapData),
    [prevLapData, selfLapData],
  );

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

  const overallBestLapSectorTimes =
    overallBestLap == null || overallBestLap.bestLapHistory == null
      ? [0, 0, 0]
      : [
          overallBestLap.bestLapHistory.m_sector1TimeInMS,
          overallBestLap.bestLapHistory.m_sector2TimeInMS,
          overallBestLap.bestLapHistory.m_sector3TimeInMS,
        ];

  const nearestTyreLapSectorTimes =
    nearestTyreLap == null || nearestTyreLap.bestLapHistory == null
      ? [0, 0, 0]
      : [
          nearestTyreLap.bestLapHistory.m_sector1TimeInMS,
          nearestTyreLap.bestLapHistory.m_sector2TimeInMS,
          nearestTyreLap.bestLapHistory.m_sector3TimeInMS,
        ];

  const diffToLastLapSector = diffSectors(
    thisLapSectorTimes,
    lastLapSectorTimes,
  );

  const { diff: diffToOverallPersonalLap } = timesFromLapData(
    overallBestLap?.bestLap || null,
    selfLapData,
  );

  const { diff: diffToNearestTyreLap } = timesFromLapData(
    nearestTyreLap?.bestLap || null,
    selfLapData,
  );

  // console.log(diffToLastLapSector);

  const diffToBestPersonalLapSector = diffSectors(
    thisLapSectorTimes,
    bestPersonalLapSectorTimes,
  );

  const diffToOverallBestLapSector = diffSectors(
    thisLapSectorTimes,
    overallBestLapSectorTimes,
  );

  const diffToNearestTyreLapSectorTimes = diffSectors(
    thisLapSectorTimes,
    nearestTyreLapSectorTimes,
  );

  const shouldHide =
    false && differenceInSeconds(currentTime, lastUpdated) > 15;

  return (
    <div
      className={`w-full h-full pointer-events-none transition-color duration-500 ${
        shouldHide
          ? 'bg-black/0 text-white/0 text-white border border-solid border-slate-800/80'
          : 'bg-black/80'
      }`}
    >
      <DiffToLap
        title="Δ Last Lap:"
        diff={diffToLastLap}
        lapTime={lastLapTimeInMs}
        sectorDiff={diffToLastLapSector}
      />
      <DiffToLap
        title="Δ Personal Best Lap:"
        diff={diffToBestPersonalLap}
        lapTime={personalBestLap?.bestLapHistory?.m_lapTimeInMS || undefined}
        sectorDiff={diffToBestPersonalLapSector}
      />
      <DiffToLap
        title="Δ Overall Best Lap:"
        diff={diffToOverallPersonalLap}
        lapTime={overallBestLap?.bestLapHistory?.m_lapTimeInMS}
        sectorDiff={diffToOverallBestLapSector}
      />
      {false && (
        <DiffToLap
          title={`Diff to close tyre (${nearestTyreLap?.driver?.m_name.substring(
            0,
            3,
          )}):`}
          diff={diffToNearestTyreLap}
          lapTime={nearestTyreLap?.bestLapHistory?.m_lapTimeInMS}
          sectorDiff={diffToNearestTyreLapSectorTimes}
        />
      )}
      <div className="flex flex-row justify-between">
        <div className="flex-grow">
          <span className="text-gray-400">Current Lap: </span>
          {msToText(currentLapTimeInMS)}
        </div>
      </div>
      {/* <div className="flex flex-row justify-between">
        <div className="flex-grow">
          <span className="text-gray-400">Current sectors:</span>
          <div className="flex flex-row justify-between text-center">
            <div className="flex-grow">{msToText(thisLapSectorTimes[0])}, </div>
            <div className="flex-grow">{msToText(thisLapSectorTimes[1])}, </div>
            <div className="flex-grow">{msToText(thisLapSectorTimes[2])}</div>
          </div>
        </div>
      </div> */}
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
          <span className="text-gray-400">Fuel left: </span>
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
          <div key={forecast.m_timeOffset} className="mr-2">
            {forecast.m_timeOffset}:{(weatherToText as any)[forecast.m_weather]}{' '}
            ({forecast.m_weather})
          </div>
        ))}
      </div>
    </div>
  );
}
