import z from "zod"
import { prisma } from "../../lib/prisma"
import { FastifyInstance } from "fastify"
import { randomUUID } from "crypto"
import { redis } from "../../lib/redis"
import { voting } from "../../utils/voting-pub-sub"















export async function voteOnPoll(app: FastifyInstance) {

    app.post("/polls/:pollId/votes", async (request, reply) => {
        const voteOnPollBody = z.object({
            pollOptionId: z.string().uuid()
        })

        const voteOnPollParams = z.object({
            pollId: z.string().uuid()
        })

        const { pollId } = voteOnPollParams.parse(request.params)
        const { pollOptionId } = voteOnPollBody.parse(request.body)

        let { sessionId } = request.cookies

        if (sessionId) {
            const userProviousVoteOnPoll = await prisma.vote.findUnique({
                where: {
                    sessionId_pollId: {
                        sessionId,
                        pollId,
                    }
                }
            })

            if (userProviousVoteOnPoll && userProviousVoteOnPoll.pollOptionId !== pollOptionId) {
                await prisma.vote.delete({
                    where: {
                        id: userProviousVoteOnPoll.id
                    }
                })

                const votes = await redis.zincrby(pollId, -1, userProviousVoteOnPoll.pollOptionId)

                voting.publish(pollId , {
                    pollOptionId: userProviousVoteOnPoll.pollOptionId,
                    votes: Number(votes),
                })
        
        
            } else if (userProviousVoteOnPoll) {
                return reply.status(400).send({ message: "Você já votou nesta enquete." })
            }
        }

        if (!sessionId) {

            sessionId = randomUUID();

            reply.setCookie('sessionId', sessionId, {
                path: "/",
                maxAge: 60 * 60 * 24 * 30,
                signed: true,
                httpOnly: true
            })
        }

        await prisma.vote.create({
            data: {
                sessionId,
                pollId,
                pollOptionId
            }
        })

        const votes = await redis.zincrby(pollId, 1 , pollOptionId)

        voting.publish(pollId , {
            pollOptionId,
            votes: Number(votes),
        })

        return reply.status(201).send()
    })

}












