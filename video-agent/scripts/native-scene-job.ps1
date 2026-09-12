param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class NativeSceneJob {
 [StructLayout(LayoutKind.Sequential)] public struct Basic { public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinimumWorkingSet, MaximumWorkingSet; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
 [StructLayout(LayoutKind.Sequential)] public struct IO { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
 [StructLayout(LayoutKind.Sequential)] public struct Extended { public Basic Basic; public IO IO; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory; }
 [StructLayout(LayoutKind.Sequential)] public struct CPU { public uint Flags, Rate; }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr attrs,string name);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int cls,IntPtr data,uint size);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool QueryInformationJobObject(IntPtr job,int cls,IntPtr data,uint size,IntPtr length);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
 public static void Set(IntPtr job,int cls,object value) { int n=Marshal.SizeOf(value);IntPtr p=Marshal.AllocHGlobal(n);try{Marshal.StructureToPtr(value,p,false);if(!SetInformationJobObject(job,cls,p,(uint)n))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());}finally{Marshal.FreeHGlobal(p);} }
 public static Extended Read(IntPtr job){int n=Marshal.SizeOf(typeof(Extended));IntPtr p=Marshal.AllocHGlobal(n);try{if(!QueryInformationJobObject(job,9,p,(uint)n,IntPtr.Zero))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());return (Extended)Marshal.PtrToStructure(p,typeof(Extended));}finally{Marshal.FreeHGlobal(p);}}
}
'@
$jobConfig = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$jobHandle = [NativeSceneJob]::CreateJobObject([IntPtr]::Zero,$null)
if ($jobHandle -eq [IntPtr]::Zero) { throw 'CreateJobObject failed' }
$workerProcess = $null
try {
 $limits = New-Object NativeSceneJob+Extended
 # KILL_ON_JOB_CLOSE | PROCESS_MEMORY | JOB_MEMORY | ACTIVE_PROCESS | JOB_TIME.
 $basic = New-Object NativeSceneJob+Basic
 $basic.Flags = 0x230C
 $basic.JobTime = [long]$jobConfig.cpuSeconds * 10000000
 $basic.ActiveProcessLimit = 24
 $limits.Basic = $basic
 $limits.ProcessMemory = [UIntPtr]::new([UInt64]$jobConfig.processMemoryBytes)
 $limits.JobMemory = [UIntPtr]::new([UInt64]$jobConfig.jobMemoryBytes)
 [NativeSceneJob]::Set($jobHandle,9,$limits)
 $cpu = New-Object NativeSceneJob+CPU
 $cpu.Flags=5; $cpu.Rate=5000
 [NativeSceneJob]::Set($jobHandle,15,$cpu)
 $startInfo = New-Object System.Diagnostics.ProcessStartInfo
 $startInfo.FileName=$jobConfig.executable
 $startInfo.Arguments=($jobConfig.arguments | ForEach-Object { '"' + $_.Replace('"','\"') + '"' }) -join ' '
 $startInfo.WorkingDirectory=$jobConfig.directory
 $startInfo.UseShellExecute=$false; $startInfo.CreateNoWindow=$true
 $startInfo.RedirectStandardOutput=$true; $startInfo.RedirectStandardError=$true
 $startInfo.EnvironmentVariables.Clear()
 foreach($item in $jobConfig.environment.PSObject.Properties){$startInfo.EnvironmentVariables[$item.Name]=[string]$item.Value}
 $workerProcess=New-Object System.Diagnostics.Process
 $workerProcess.StartInfo=$startInfo
 if(-not $workerProcess.Start()){throw 'Isolated worker did not start'}
 # Trusted worker cannot load the composition until it observes this post-assignment gate.
 if(-not [NativeSceneJob]::AssignProcessToJobObject($jobHandle,$workerProcess.Handle)){$workerProcess.Kill();throw [System.ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())}
 $stdoutTask=$workerProcess.StandardOutput.ReadToEndAsync();$stderrTask=$workerProcess.StandardError.ReadToEndAsync()
 [IO.File]::WriteAllText($jobConfig.gate,'assigned')
 $timedOut=-not $workerProcess.WaitForExit([int]$jobConfig.wallMs)
 if($timedOut){[void][NativeSceneJob]::TerminateJobObject($jobHandle,124);$workerProcess.WaitForExit()}
 $result=[NativeSceneJob]::Read($jobHandle)
 $receipt=[ordered]@{protocolVersion=1;type='windows-job';assigned=$true;pid=$workerProcess.Id;exitCode=$workerProcess.ExitCode;timedOut=$timedOut;limitFlags=$result.Basic.Flags;cpuRate=5000;cpuSeconds=$jobConfig.cpuSeconds;processMemoryBytes=$result.ProcessMemory.ToUInt64();jobMemoryBytes=$result.JobMemory.ToUInt64();peakProcessMemoryBytes=$result.PeakProcessMemory.ToUInt64();peakJobMemoryBytes=$result.PeakJobMemory.ToUInt64();stdout=$stdoutTask.Result;stderr=$stderrTask.Result} | ConvertTo-Json -Compress
 Write-Output ('HF_SCENE_SUPERVISOR ' + $receipt)
 if($timedOut){exit 124};exit $workerProcess.ExitCode
}finally{[void][NativeSceneJob]::CloseHandle($jobHandle);if($workerProcess){$workerProcess.Dispose()}}
