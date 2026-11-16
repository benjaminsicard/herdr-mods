#!/bin/sh
# Posts or closes one agent's desktop notification on Linux.
# GNOME lets only the sender close a notification, so each one is held by a
# notify-send that waits on it and closes it when interrupted. Clicking the
# notification focuses the agent in Herdr.
#
#   linux-notify.sh post <address> <urgency> <title> <body>
#   linux-notify.sh close <address>

dir="${XDG_RUNTIME_DIR:-/tmp}/herdr-desktop-notifications"
mkdir -p "$dir"
pidfile="$dir/$(printf %s "$2" | tr '/' '_').pid"

# Interrupts the notify-send holding this agent's notification, if it is
# still that notify-send (a pid can be reused).
close() {
	pid=$(cat "$pidfile" 2>/dev/null)
	if [ -n "$pid" ] && [ "$(cat "/proc/$pid/comm" 2>/dev/null)" = notify-send ]
	then
		kill -INT "$pid"
	fi
	rm -f "$pidfile"
}

case $1 in
close)
	close
	;;
post)
	close
	setsid -f sh -c '
		action=$(sh -c '\''echo $$ > "$0"; exec notify-send \
			--app-name=Herdr --urgency="$1" --action=default=Open \
			"$2" "$3"'\'' "$1" "$2" "$3" "$4")
		pid=$(cat "$1" 2>/dev/null)
		if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null
		then
			rm -f "$1"
		fi
		if [ "$action" = default ]
		then
			herdr-app do agent.focus --terminal "$5"
		fi
	' sh "$pidfile" "$3" "$4" "$5" "$2" >/dev/null 2>&1 </dev/null
	;;
esac
