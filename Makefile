# The Factory's check for `make`: scripts/check is where the check lives, and a Run's
# checks node, bin/land and this all run that one file, so `make` cannot answer with a
# check different from a Run's.
check:
	@scripts/check

.PHONY: check
