package logging

import (
	"fmt"
	"sync/atomic"
)

var debugEnabled atomic.Bool

func SetDebug(enabled bool) {
	debugEnabled.Store(enabled)
}

func Enabled() bool {
	return debugEnabled.Load()
}

func Debugf(format string, args ...interface{}) {
	if !Enabled() {
		return
	}
	fmt.Printf("[debug] "+format+"\n", args...)
}
