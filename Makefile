BIN=$(shell pwd)/.cabal-sandbox/bin

.PHONY: all clean

all:
	cabal sandbox init
	cabal install --dependencies-only
	cabal install
	PATH=$(BIN):$(PATH) haste-boot --local

clean:
	cabal clean
	cabal sandbox delete
	rm -rf ~/.haste/
