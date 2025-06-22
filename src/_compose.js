// Takes 2 lists of components and returns a list of components that is the
// result of their composition
// op0, op1 => op' such that op1(op0(D)) = op'(D)
module.exports = function _compose(...ops) {
  const result = []                    // outputs 1 list of components
  const cursors = [0, 0]               // input lists' cursors
  const comps = [ops[0][0], ops[1][0]] // next pair of components to compose

  let jumpTo, block, rest
  // read: indexes of the operations that are consumed on this step
  // keep: index of the operation whose component is added to the result
  //       operation on this step
  const step = (read, keep) => {
    jumpTo = Math.min(...read.map(i => comps[i].length))
    read.forEach(i => {
      [block, rest] = comps[i].split(jumpTo)  // step forward as far as possible
      comps[i] = rest || ops[i][++cursors[i]] // prepare the next components
      if (i === keep) result.push(block)      // push the resulting component
    })
  }

  let t0, t1
  while (t0 = comps[0]?.type, t1 = comps[1]?.type, t0 || t1) {
    if (!t0 && t1 !== 'ins') throw new Error('operation 0 is too short') // op1 can keep inserting at the end
    if (!t1 && t0 !== 'del') throw new Error('operation 1 is too short') // op0 can still delete the end

    if      (t0 === 'ret' && t1 === 'ret') step([0, 1], 0) // no changes
    else if (t0 === 'ins' && t1 === 'del') step([0, 1]   ) // 'ins' then 'del' = no-op
    else if (t0 === 'del'                ) step([0   ], 0)
    else if (                t1 === 'ins') step([   1], 1)
    else if (                t1 === 'del') step([0, 1], 1)
    else  /* t0 === 'ins' */               step([0, 1], 0)
  }

  return result
}
