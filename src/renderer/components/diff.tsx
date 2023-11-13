import React from 'react';
import { getClassNameFromMs, msToText } from '../helpers/util';

export default function DiffToLap({
  title,
  diff,
  lapTime,
  sectorDiff,
}: {
  title: string;
  diff: number | undefined;
  lapTime: number | undefined;
  sectorDiff: number[] | undefined;
}) {
  return (
    <div className="border-y border-solid border-y-blue-800">
      <div className="flex flex-row justify-between text-center">
        {diff != null && (
          <div className={`text-3xl mr-2 ${getClassNameFromMs(diff)}`}>
            {msToText(diff)}
          </div>
        )}
        <div className="flex-grow flex flex-col items-start justify-start truncate">
          <div>
            <span className="text-gray-400 truncate">
              ({lapTime == null ? '' : msToText(lapTime)}) {title}
            </span>
          </div>
          {sectorDiff != null && (
            <div className="flex flex-row justify-between text-center w-full">
              <div className={`flex-grow ${getClassNameFromMs(sectorDiff[0])}`}>
                {msToText(sectorDiff[0])},{' '}
              </div>
              <div className={`flex-grow ${getClassNameFromMs(sectorDiff[1])}`}>
                {msToText(sectorDiff[1])},{' '}
              </div>
              <div className={`flex-grow ${getClassNameFromMs(sectorDiff[2])}`}>
                {msToText(sectorDiff[2])}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
